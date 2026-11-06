import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardSummary } from '../features/dashboard/summary';
import { STATUSES } from '../features/work-orders/labels';
import { DEFAULT_LIST_PARAMS, parseListParams } from '../features/work-orders/list-params';
import { errorBody, makeOrder, server, SUPERVISOR, USER } from '../test/api-mock';
import { mockOrderApi } from '../test/order-api-mock';
import { currentUrl, renderAppAs } from '../test/render-app';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Bem no passado: se o "há N dias" usasse o relógio do navegador, os números seriam outros.
const GENERATED_AT = '2026-01-10T15:00:00.000Z';

function makeSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    byStatus: { OPEN: 5, IN_PROGRESS: 2, DONE: 2, CANCELLED: 1 },
    overdue: { count: 0, items: [] },
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

/** Responde `GET /dashboard/summary` e conta as requisições. */
function mockSummary(respond: () => Response | Promise<Response>) {
  const calls = { count: 0 };
  server.use(
    http.get('/api/dashboard/summary', () => {
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

const ok = (summary: DashboardSummary) => () => HttpResponse.json(summary);

async function openDashboard(user = SUPERVISOR) {
  renderAppAs(user, '/dashboard');
  await screen.findByRole('heading', { level: 2, name: 'Ordens por status' });
}

const card = (name: RegExp) => screen.getByRole('link', { name });
const definition = (term: RegExp) =>
  screen.getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Painel (/dashboard)', () => {
  it('renderiza contadores, total e ativas a partir da resposta', async () => {
    mockSummary(ok(makeSummary({ overdue: { count: 4, items: [] } })));
    await openDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument();
    expect(card(/^Abertas: 5,/)).toBeInTheDocument();
    expect(card(/^Em andamento: 2,/)).toBeInTheDocument();
    expect(card(/^Concluídas: 2,/)).toBeInTheDocument();
    expect(card(/^Canceladas: 1,/)).toBeInTheDocument();
    expect(card(/^Atrasadas: 4,/)).toBeInTheDocument();
    expect(definition(/^Total/)).toBe('10');
    expect(definition(/^Ativas/)).toBe('7');
    // 15:00 UTC = 12:00 em São Paulo (fuso dos testes).
    expect(screen.getByText('Atualizado às 12:00')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Abertas 5 \(50%\)/ })).toBeInTheDocument();
  });

  it('chaves zeradas aparecem como 0, nunca ausentes', async () => {
    mockSummary(ok(makeSummary({ byStatus: { OPEN: 3, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 } })));
    await openDashboard();

    expect(card(/^Em andamento: 0, ver lista$/)).toHaveTextContent('0');
    expect(card(/^Concluídas: 0, ver lista$/)).toBeInTheDocument();
    expect(card(/^Canceladas: 0, ver lista$/)).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Canceladas/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['0', '0%']);
  });

  it('cada card leva à lista com o filtro certo (a URL interpretada produz o filtro)', async () => {
    mockSummary(ok(makeSummary()));
    await openDashboard();

    const filterOf = (name: RegExp) => {
      const href = card(name).getAttribute('href') ?? '';
      const url = new URL(href, 'http://localhost');
      expect(url.pathname).toBe('/orders');
      return parseListParams(url.searchParams);
    };
    const labels = {
      OPEN: /^Abertas:/,
      IN_PROGRESS: /^Em andamento:/,
      DONE: /^Concluídas:/,
      CANCELLED: /^Canceladas:/,
    };
    for (const status of STATUSES) {
      expect(filterOf(labels[status])).toEqual({ ...DEFAULT_LIST_PARAMS, status: [status] });
    }
    expect(filterOf(/^Atrasadas:/)).toEqual({
      ...DEFAULT_LIST_PARAMS,
      overdue: true,
      sortBy: 'dueDate',
      order: 'asc',
    });
    expect(filterOf(/^Minhas ordens em aberto$/)).toEqual({
      ...DEFAULT_LIST_PARAMS,
      mine: true,
      status: ['OPEN', 'IN_PROGRESS'],
    });
  });

  it('clicar no card abre a lista e a lista consulta a API com o mesmo filtro', async () => {
    mockSummary(ok(makeSummary()));
    const requests: URLSearchParams[] = [];
    server.use(
      http.get('/api/work-orders', ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
      }),
    );
    await openDashboard();
    await userEvent.click(card(/^Atrasadas:/));

    expect(currentUrl()).toBe('/orders?overdue=true&sortBy=dueDate&order=asc');
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].get('overdue')).toBe('true');
    expect(requests[0].get('sortBy')).toBe('dueDate');
    expect(requests[0].get('order')).toBe('asc');
  });

  it('atrasadas na ordem recebida, "há N dias" por generatedAt; "Ver todas" só com count > 10', async () => {
    const items = [
      makeOrder({ title: 'Mais antiga', dueDate: '2026-01-07T15:00:00.000Z', priority: 'URGENT' }),
      makeOrder({ title: 'Do meio', dueDate: '2026-01-09T15:00:00.000Z', assignee: null }),
      makeOrder({ title: 'Mais nova', dueDate: '2026-01-10T13:00:00.000Z' }),
    ];
    mockSummary(ok(makeSummary({ overdue: { count: 3, items } })));
    await openDashboard();

    const table = screen.getByRole('table', { name: /Ordens atrasadas/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual([
      'Mais antiga',
      'Do meio',
      'Mais nova',
    ]);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', `/orders/${items[0].id}`);
    expect(rows[0]).toHaveTextContent('Urgente');
    expect(rows[0]).toHaveTextContent('há 3 dias');
    expect(rows[1]).toHaveTextContent('Sem responsável');
    expect(rows[1]).toHaveTextContent('há 1 dia');
    expect(rows[2]).toHaveTextContent('há 2 horas');
    expect(screen.queryByRole('link', { name: /Ver todas/ })).not.toBeInTheDocument();
  });

  it('com mais de 10 atrasadas, "Ver todas as N atrasadas" leva à lista filtrada', async () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      makeOrder({ title: `Atrasada ${index + 1}`, dueDate: '2026-01-01T12:00:00.000Z' }),
    );
    mockSummary(ok(makeSummary({ overdue: { count: 1234, items } })));
    await openDashboard();

    expect(screen.getByRole('link', { name: 'Ver todas as 1.234 atrasadas' })).toHaveAttribute(
      'href',
      '/orders?overdue=true&sortBy=dueDate&order=asc',
    );
  });

  it('zero atrasadas: mensagem positiva no lugar de uma lista vazia', async () => {
    mockSummary(ok(makeSummary()));
    await openDashboard();

    expect(screen.getByText(/Nenhuma ordem atrasada/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Ordens atrasadas/ })).not.toBeInTheDocument();
    expect(card(/^Atrasadas: 0,/)).toBeInTheDocument();
  });

  it('sistema sem nenhuma ordem: estado vazio com "Nova ordem", sem cards nem barra', async () => {
    mockSummary(ok(makeSummary({ byStatus: { OPEN: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 } })));
    renderAppAs(USER, '/dashboard');

    expect(await screen.findByText('Nenhuma ordem cadastrada ainda.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nova ordem' })).toHaveAttribute('href', '/orders/new');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Abertas:/ })).not.toBeInTheDocument();
  });

  it('carregando na primeira vez: skeleton com texto para leitor de tela', async () => {
    mockSummary(async () => {
      await delay(50);
      return HttpResponse.json(makeSummary());
    });
    renderAppAs(SUPERVISOR, '/dashboard');

    expect(await screen.findByText('Carregando painel…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /^Abertas:/ })).toBeInTheDocument();
    expect(screen.queryByText('Carregando painel…')).not.toBeInTheDocument();
  });

  it('erro na primeira vez: mensagem e "Tentar de novo" que busca outra vez', async () => {
    let fail = true;
    const calls = mockSummary(() =>
      fail ? errorBody(500, 'INTERNAL_ERROR') : HttpResponse.json(makeSummary()),
    );
    renderAppAs(SUPERVISOR, '/dashboard');

    const alert = await screen.findByRole('alert');
    // A mesma política de retry da lista: uma nova tentativa em 5xx.
    expect(calls.count).toBe(2);
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('link', { name: /^Abertas: 5/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('"Atualizar" refaz a requisição, mostra o carregamento e anuncia o fim', async () => {
    let summary = makeSummary();
    // A resposta só sai quando o teste soltar a trava: o "durante a busca" não depende de tempo.
    let release = () => {};
    let gate = Promise.resolve();
    const calls = mockSummary(async () => {
      await gate;
      return HttpResponse.json(summary);
    });
    await openDashboard();
    expect(calls.count).toBe(1);

    summary = makeSummary({
      byStatus: { OPEN: 6, IN_PROGRESS: 2, DONE: 2, CANCELLED: 1 },
      generatedAt: '2026-01-10T15:45:00.000Z',
    });
    gate = new Promise((resolve) => (release = resolve));
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    // Durante a busca: dados anteriores na tela, botão em carregamento e aria-busy.
    const button = await screen.findByRole('button', { name: 'Atualizando…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(card(/^Abertas: 5/).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    // Clique repetido durante a busca não dispara outra requisição.
    await userEvent.click(button);
    expect(calls.count).toBe(2);

    release();
    expect(await screen.findByRole('link', { name: /^Abertas: 6/ })).toBeInTheDocument();
    expect(calls.count).toBe(2);
    expect(screen.getByText('Atualizado às 12:45')).toBeInTheDocument();
    expect(await screen.findByText('Painel atualizado às 12:45.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveFocus();
  });

  it('erro ao atualizar mantém os números anteriores na tela', async () => {
    let fail = false;
    mockSummary(() =>
      fail ? errorBody(503, 'SERVICE_UNAVAILABLE') : HttpResponse.json(makeSummary()),
    );
    await openDashboard();

    fail = true;
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(card(/^Abertas: 5/)).toBeInTheDocument();
    expect(definition(/^Total/)).toBe('10');
    // Falhou: nada de "Painel atualizado" no anúncio (o erro é anunciado pelo role="alert").
    expect(screen.queryByText(/Painel atualizado/)).not.toBeInTheDocument();
  });

  it('depois de mudar o status de uma ordem, o painel busca os números de novo', async () => {
    const order = makeOrder({
      title: 'Atrasada da Ana',
      dueDate: '2026-01-09T15:00:00.000Z',
      assignee: { id: USER.id, name: USER.name },
    });
    mockOrderApi(order);
    let summary = makeSummary({ overdue: { count: 1, items: [order] } });
    const calls = mockSummary(() => HttpResponse.json(summary));
    await openDashboard(USER);
    expect(calls.count).toBe(1);

    const table = screen.getByRole('table', { name: /Ordens atrasadas/ });
    await userEvent.click(within(table).getByRole('link', { name: 'Atrasada da Ana' }));
    summary = makeSummary({ byStatus: { OPEN: 4, IN_PROGRESS: 3, DONE: 2, CANCELLED: 1 } });
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar ordem' }));
    await screen.findByRole('button', { name: 'Concluir ordem' });

    // Volta pelo menu, ainda dentro dos 30 s de staleTime: só busca porque foi invalidado.
    await userEvent.click(screen.getByRole('link', { name: 'Painel' }));
    expect(await screen.findByRole('link', { name: /^Em andamento: 3/ })).toBeInTheDocument();
    expect(calls.count).toBe(2);
  });

  it('sem mutação, voltar ao painel dentro de 30 s usa o cache (sem nova requisição)', async () => {
    const calls = mockSummary(ok(makeSummary()));
    server.use(
      http.get('/api/work-orders', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      ),
    );
    await openDashboard();
    await userEvent.click(screen.getByRole('link', { name: 'Ordens' }));
    await userEvent.click(screen.getByRole('link', { name: 'Painel' }));

    expect(await screen.findByRole('link', { name: /^Abertas: 5/ })).toBeInTheDocument();
    expect(calls.count).toBe(1);
  });

  it('"/" redireciona para /dashboard e o menu marca o item ativo', async () => {
    mockSummary(ok(makeSummary()));
    renderAppAs(SUPERVISOR, '/');

    await screen.findByRole('heading', { level: 1, name: 'Painel' });
    expect(currentUrl()).toBe('/dashboard');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Painel' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Ordens' })).not.toHaveAttribute('aria-current');
  });

  it('hierarquia de títulos: h1 Painel e um h2 por seção', async () => {
    mockSummary(ok(makeSummary()));
    await openDashboard();

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Painel',
    ]);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Ordens por status',
      'Resumo',
      'Ordens atrasadas',
    ]);
  });
});
