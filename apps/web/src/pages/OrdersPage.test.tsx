import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AppProviders } from '../AppProviders';
import { ERROR_MESSAGES } from '../lib/error-messages';
import { createQueryClient } from '../lib/query-client';
import { getToken, setToken } from '../lib/session';
import { errorBody, makeOrder, makePage, mockWorkOrders, server } from '../test/api-mock';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  // Se um teste com timers falsos estourar o tempo, o `finally` dele não roda.
  vi.useRealTimers();
});
afterAll(() => server.close());
beforeEach(() => setToken('token-de-teste'));

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="url">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(path: string) {
  const client = createQueryClient();
  // Mesma política de retry do app, sem a espera entre as tentativas.
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders client={client}>
        <App />
        <CurrentUrl />
      </AppProviders>
    </MemoryRouter>,
  );
}

const url = () => screen.getByLabelText('url').textContent;
// "Página X de Y" tem partes em <span>; confere o texto da navegação inteira.
const expectPagination = (text: string) =>
  waitFor(() =>
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent(text),
  );
// Tabela e cartões ficam os dois no DOM (o CSS esconde um); os testes olham a tabela.
const table = () => screen.getByRole('table', { name: 'Ordens de serviço' });

describe('Lista de ordens (/orders)', () => {
  it('renderiza a lista com os dados e os rótulos em português', async () => {
    mockWorkOrders(() =>
      HttpResponse.json(
        makePage([
          makeOrder({
            title: 'Vazamento na copa',
            status: 'IN_PROGRESS',
            priority: 'URGENT',
            assignee: null,
            dueDate: '2020-01-01T15:00:00.000Z',
          }),
          makeOrder({ title: 'Trocar lâmpada', status: 'DONE', priority: 'LOW' }),
        ]),
      ),
    );
    renderAt('/');

    await screen.findByRole('table', { name: 'Ordens de serviço' });
    expect(url()).toBe('/orders');
    const [first, second] = within(table()).getAllByRole('row').slice(1);
    expect(within(first).getByRole('link', { name: 'Vazamento na copa' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/orders\/[0-9a-f-]+$/),
    );
    expect(first).toHaveTextContent('Em andamento');
    expect(first).toHaveTextContent('Urgente');
    expect(first).toHaveTextContent('Sem responsável');
    // UTC 15:00 no fuso dos testes (UTC-3).
    expect(first).toHaveTextContent('01/01/2020, 12:00');
    expect(first).toHaveTextContent('Atrasada');
    expect(second).toHaveTextContent('Concluída');
    expect(second).toHaveTextContent('Baixa');
    expect(second).toHaveTextContent('Ana Operadora');
    expect(second).not.toHaveTextContent('Atrasada');
    expect(screen.getByText('2 ordens encontradas')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent(
      'Página 1 de 1 · 2 resultados',
    );
  });

  it('a busca só altera a URL e a requisição depois do debounce', async () => {
    const requests = mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    renderAt('/orders');
    await screen.findByRole('table', { name: 'Ordens de serviço' });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // fireEvent, e não user-event: o asyncWrapper do Testing Library espera um setTimeout(0)
      // que só anda com timers falsos do Jest. Uma mudança por letra, como digitar.
      const search = screen.getByRole('searchbox', { name: 'Buscar' });
      // 100 ms entre as letras: cada uma reinicia a espera de 300 ms.
      fireEvent.change(search, { target: { value: 'b' } });
      for (const text of ['bo', 'bom', 'bomb', 'bomba']) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
        fireEvent.change(search, { target: { value: text } });
      }

      expect(url()).toBe('/orders');
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(url()).toBe('/orders');
      expect(requests.every((query) => !query.has('q'))).toBe(true);

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(url()).toBe('/orders?q=bomba');
      await vi.waitFor(async () => {
        await act(() => vi.advanceTimersByTimeAsync(10));
        expect(requests.at(-1)?.get('q')).toBe('bomba');
      });
      // Uma requisição na abertura e uma depois da busca, não uma por letra.
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marcar um status atualiza a URL, volta para a página 1 e envia a query certa', async () => {
    const requests = mockWorkOrders((query) =>
      HttpResponse.json(makePage([makeOrder()], { total: 100, page: Number(query.get('page')) })),
    );
    renderAt('/orders?page=3&sortBy=dueDate');
    await expectPagination('Página 3 de 5 · 100 resultados');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Aberta' }));

    expect(url()).toBe('/orders?status=OPEN&sortBy=dueDate');
    await waitFor(() =>
      expect(requests.at(-1)?.toString()).toBe(
        'status=OPEN&page=1&pageSize=20&sortBy=dueDate&order=desc',
      ),
    );
    expect(
      within(screen.getByRole('group', { name: 'Status' })).getByLabelText('Aberta'),
    ).toBeChecked();
  });

  it('mostra o skeleton enquanto carrega pela primeira vez', async () => {
    mockWorkOrders(async () => {
      await delay(50);
      return HttpResponse.json(makePage([makeOrder({ title: 'Chegou' })]));
    });
    renderAt('/orders');

    expect(await screen.findByText('Carregando ordens…')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resultados' })).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findAllByRole('link', { name: 'Chegou' })).not.toHaveLength(0);
    expect(screen.queryByText('Carregando ordens…')).not.toBeInTheDocument();
  });

  it('erro inesperado mostra a mensagem, o requestId e "Tentar de novo" funciona', async () => {
    let fail = true;
    const requests = mockWorkOrders(() =>
      fail
        ? errorBody(500, 'INTERNAL_ERROR', 'req-abc-123')
        : HttpResponse.json(makePage([makeOrder({ title: 'Voltou' })])),
    );
    renderAt('/orders');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.INTERNAL_ERROR);
    expect(alert).toHaveTextContent('req-abc-123');
    // 5xx: a requisição original e uma repetição automática.
    expect(requests).toHaveLength(2);

    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findAllByRole('link', { name: 'Voltou' })).not.toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro depois de dados carregados mantém a lista anterior na tela', async () => {
    mockWorkOrders((query) =>
      query.get('page') === '2'
        ? HttpResponse.error()
        : HttpResponse.json(makePage([makeOrder({ title: 'Primeira página' })], { total: 40 })),
    );
    renderAt('/orders');
    await expectPagination('Página 1 de 2 · 40 resultados');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGES.NETWORK_ERROR);
    expect(within(table()).getByRole('link', { name: 'Primeira página' })).toBeInTheDocument();
    // Erro esperado (rede): sem código para o suporte.
    expect(screen.getByRole('alert')).not.toHaveTextContent('Código para o suporte');
  });

  it('vazio sem nenhuma ordem no sistema', async () => {
    mockWorkOrders(() => HttpResponse.json(makePage([])));
    renderAt('/orders');

    expect(
      await screen.findByText('Nenhuma ordem de serviço cadastrada ainda.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument();
  });

  it('vazio por causa dos filtros, com "Limpar filtros" que mantém a ordenação', async () => {
    mockWorkOrders((query) =>
      HttpResponse.json(query.has('status') ? makePage([]) : makePage([makeOrder()])),
    );
    renderAt('/orders?status=DONE&order=asc');

    const empty = await screen.findByText('Nenhuma ordem encontrada com esses filtros.');
    const region = screen.getByRole('region', { name: 'Resultados' });
    expect(empty).toBeInTheDocument();

    await userEvent.click(within(region).getByRole('button', { name: 'Limpar filtros' }));

    expect(url()).toBe('/orders?order=asc');
    await screen.findByText('1 ordem encontrada');
  });

  it.each([
    ['página inválida', '/orders?page=abc&status=OPEN', '/orders?status=OPEN'],
    ['página zero', '/orders?page=0', '/orders'],
    ['valores fora do enum', '/orders?status=OPEN,FOO&sortBy=title', '/orders?status=OPEN'],
  ])('%s na URL é corrigida', async (_name, path, expected) => {
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    renderAt(path);
    await waitFor(() => expect(url()).toBe(expected));
  });

  it('página além do fim leva à última página existente', async () => {
    const requests = mockWorkOrders((query) => {
      const page = Number(query.get('page'));
      // Como a API: além do fim vem lista vazia, mas com o total e o número de páginas.
      return HttpResponse.json(
        page > 3 ? makePage([], { total: 45, page }) : makePage([makeOrder()], { total: 45, page }),
      );
    });
    renderAt('/orders?page=50');

    await waitFor(() => expect(url()).toBe('/orders?page=3'));
    await expectPagination('Página 3 de 3 · 45 resultados');
    expect(requests.map((query) => query.get('page'))).toEqual(['50', '3']);
  });

  it('URL com filtros já aplicados abre a tela com os controles preenchidos', async () => {
    const requests = mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    renderAt(
      '/orders?q=bomba&status=OPEN,DONE&priority=HIGH&assignee=me&overdue=true' +
        '&dueFrom=2026-11-01&dueTo=2026-11-30&sortBy=dueDate&order=asc&page=2',
    );

    expect(await screen.findByRole('searchbox', { name: 'Buscar' })).toHaveValue('bomba');
    const status = within(screen.getByRole('group', { name: 'Status' }));
    expect(status.getByLabelText('Aberta')).toBeChecked();
    expect(status.getByLabelText('Concluída')).toBeChecked();
    expect(status.getByLabelText('Em andamento')).not.toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'Prioridade' })).getByLabelText('Alta'),
    ).toBeChecked();
    expect(screen.getByLabelText('Minhas ordens')).toBeChecked();
    expect(screen.getByLabelText('Somente atrasadas')).toBeChecked();
    expect(screen.getByLabelText('Prazo de')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Prazo até')).toHaveValue('2026-11-30');
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('dueDate');
    expect(screen.getByLabelText('Sentido')).toHaveValue('asc');

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(Object.fromEntries(requests[0])).toEqual({
      q: 'bomba',
      status: 'OPEN,DONE',
      priority: 'HIGH',
      assigneeId: 'me',
      overdue: 'true',
      dueFrom: '2026-11-01T03:00:00.000Z',
      dueTo: '2026-12-01T02:59:59.999Z',
      page: '2',
      pageSize: '20',
      sortBy: 'dueDate',
      order: 'asc',
    });
  });

  it('prazo "de" depois do "até" mostra o erro no campo e não consulta a API', async () => {
    const requests = mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    renderAt('/orders?dueFrom=2026-12-01&dueTo=2026-11-01');

    expect(await screen.findByLabelText('Prazo até')).toHaveAccessibleDescription(
      '"Prazo até" não pode ser antes de "Prazo de".',
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(0);
  });

  it('trocar de página move o foco para o título "Resultados"', async () => {
    mockWorkOrders((query) =>
      HttpResponse.json(makePage([makeOrder()], { total: 40, page: Number(query.get('page')) })),
    );
    renderAt('/orders');
    await expectPagination('Página 1 de 2 · 40 resultados');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    expect(url()).toBe('/orders?page=2');
    expect(screen.getByRole('heading', { name: 'Resultados' })).toHaveFocus();
    await expectPagination('Página 2 de 2 · 40 resultados');
  });

  it('ordenação e prazo escrevem na URL', async () => {
    const requests = mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    renderAt('/orders');
    await screen.findByRole('table', { name: 'Ordens de serviço' });

    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'priority');
    await userEvent.selectOptions(screen.getByLabelText('Sentido'), 'asc');
    fireEvent.change(screen.getByLabelText('Prazo de'), { target: { value: '2026-11-04' } });
    await userEvent.click(screen.getByLabelText('Somente atrasadas'));
    await userEvent.click(screen.getByLabelText('Urgente'));

    expect(url()).toBe(
      '/orders?priority=URGENT&overdue=true&dueFrom=2026-11-04&sortBy=priority&order=asc',
    );
    await waitFor(() => expect(requests.at(-1)?.get('dueFrom')).toBe('2026-11-04T03:00:00.000Z'));

    fireEvent.change(screen.getByLabelText('Prazo de'), { target: { value: '' } });
    expect(url()).toBe('/orders?priority=URGENT&overdue=true&sortBy=priority&order=asc');
  });

  it('o título leva ao detalhe provisório, que volta para a lista com os mesmos filtros', async () => {
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder({ title: 'Porta travando' })])));
    renderAt('/orders?status=OPEN&sortBy=dueDate');
    await expectPagination('Página 1 de 1');

    await userEvent.click(within(table()).getByRole('link', { name: 'Porta travando' }));

    expect(screen.getByRole('heading', { name: 'Detalhe em construção' })).toBeInTheDocument();
    expect(url()).toMatch(/^\/orders\/[0-9a-f-]+$/);
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para a lista' }));
    expect(url()).toBe('/orders?status=OPEN&sortBy=dueDate');
  });

  it('o botão de tema alterna e guarda a escolha', async () => {
    mockWorkOrders(() => HttpResponse.json(makePage([])));
    renderAt('/orders');

    await userEvent.click(await screen.findByRole('button', { name: 'Tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('opsboard.theme')).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: 'Tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    localStorage.removeItem('opsboard.theme');
  });

  it('401 em qualquer requisição limpa a sessão e leva ao /login', async () => {
    mockWorkOrders(() => errorBody(401, 'UNAUTHORIZED'));
    renderAt('/orders?status=OPEN');

    expect(await screen.findByRole('form', { name: 'Entrar' })).toBeInTheDocument();
    expect(url()).toBe('/login');
    expect(getToken()).toBeNull();
  });

  it('401 também no /auth/me (sessão vencida ao abrir) leva ao /login', async () => {
    server.use(http.get('/api/auth/me', () => errorBody(401, 'UNAUTHORIZED')));
    renderAt('/orders');

    expect(await screen.findByRole('form', { name: 'Entrar' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });
});
