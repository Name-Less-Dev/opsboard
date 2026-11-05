import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { WorkOrderEvent } from '../features/work-orders/history/history-types';
import { errorBody, makeOrder, OTHER_OPERATOR, server, SUPERVISOR, USER } from '../test/api-mock';
import { mockOrderApi } from '../test/order-api-mock';
import { currentUrl, renderAppAs } from '../test/render-app';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ORDER = makeOrder({ title: 'Trocar filtro', assignee: { id: USER.id, name: USER.name } });
const EVENTS_PATH = `/api/work-orders/${ORDER.id}/events`;
const CARLA = { id: SUPERVISOR.id, name: SUPERVISOR.name };

let eventSequence = 0;
function makeEvent(overrides: Partial<WorkOrderEvent> & Pick<WorkOrderEvent, 'type'>) {
  eventSequence += 1;
  return {
    id: `f0000000-0000-4000-8000-${String(eventSequence).padStart(12, '0')}`,
    actor: CARLA,
    fromStatus: null,
    toStatus: null,
    details: null,
    createdAt: '2026-11-04T15:00:00.000Z',
    ...overrides,
  };
}

/** Responde o histórico com `events` paginados, como a API, e conta as requisições. */
function mockHistory(events: WorkOrderEvent[], respond?: (page: number) => Response | undefined) {
  const pages: number[] = [];
  server.use(
    http.get(EVENTS_PATH, ({ request }) => {
      const query = new URL(request.url).searchParams;
      const page = Number(query.get('page'));
      const pageSize = Number(query.get('pageSize'));
      pages.push(page);
      return (
        respond?.(page) ??
        HttpResponse.json({
          items: events.slice((page - 1) * pageSize, page * pageSize),
          total: events.length,
          page,
          pageSize,
          totalPages: Math.ceil(events.length / pageSize),
        })
      );
    }),
  );
  return pages;
}

async function openDetail(user = SUPERVISOR) {
  renderAppAs(user, `/orders/${ORDER.id}`);
  await screen.findByRole('heading', { level: 1, name: ORDER.title });
}

const timeline = () => screen.findByRole('list', { name: 'Histórico da ordem' });
const itemTexts = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list)
    .map((item) => item.querySelector('p')?.textContent);
const section = () => screen.getByRole('region', { name: 'Histórico' });

describe('Histórico no detalhe da ordem', () => {
  it('linha do tempo na ordem recebida, com frases em português e <time> com o ISO', async () => {
    mockOrderApi(ORDER);
    mockHistory([
      makeEvent({
        type: 'STATUS_CHANGED',
        actor: { id: USER.id, name: 'Ana Operadora' },
        fromStatus: 'OPEN',
        toStatus: 'IN_PROGRESS',
        createdAt: '2026-11-04T18:30:00.000Z',
      }),
      makeEvent({
        type: 'UPDATED',
        details: {
          changes: [
            { field: 'title', from: 'Filtro', to: 'Trocar filtro' },
            { field: 'priority', from: 'LOW', to: 'HIGH' },
          ],
        },
      }),
      makeEvent({
        type: 'ASSIGNED',
        details: { from: null, to: { id: USER.id, name: 'Ana Operadora' } },
      }),
      makeEvent({ type: 'CREATED', toStatus: 'OPEN' }),
    ]);
    await openDetail();

    const list = await timeline();
    expect(itemTexts(list)).toEqual([
      'Ana Operadora iniciou a ordem (Aberta → Em andamento)',
      'Carla Supervisora alterou título e prioridade',
      'Carla Supervisora atribuiu a ordem a Ana Operadora',
      'Carla Supervisora criou a ordem',
    ]);
    // Nome do ator em destaque.
    expect(within(list).getAllByText('Carla Supervisora', { selector: 'strong' })).toHaveLength(3);
    // Antes → depois dos campos com valor.
    expect(within(list).getByText('Prioridade: Baixa → Alta')).toBeInTheDocument();
    // Horário no fuso local, com o ISO original no atributo (18:30 UTC = 15:30 em São Paulo).
    const time = within(list).getByText('04/11/2026, 15:30');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-11-04T18:30:00.000Z');
    expect(within(section()).getByRole('heading', { level: 2, name: 'Histórico' })).toBeVisible();
    // Uma página só: sem paginação.
    expect(screen.queryByRole('navigation', { name: 'Paginação do histórico' })).toBeNull();
  });

  it('details null e tipo desconhecido viram texto genérico, sem quebrar a tela', async () => {
    mockOrderApi(ORDER);
    mockHistory([
      { ...makeEvent({ type: 'CREATED' }), type: 'COMMENTED' } as unknown as WorkOrderEvent,
      makeEvent({ type: 'UPDATED', details: null }),
      makeEvent({ type: 'ASSIGNED', details: null }),
    ]);
    await openDetail();

    expect(itemTexts(await timeline())).toEqual([
      'Alteração registrada por Carla Supervisora',
      'Alteração registrada por Carla Supervisora',
      'Alteração registrada por Carla Supervisora',
    ]);
  });

  it('paginação: mantém a página anterior enquanto carrega e leva o foco ao título', async () => {
    mockOrderApi(ORDER);
    const events = Array.from({ length: 25 }, (_, index) =>
      makeEvent({
        type: 'UPDATED',
        details: { changes: [{ field: 'title', from: `T${index + 1}`, to: `T${index}` }] },
      }),
    );
    let release = () => {};
    let gate = Promise.resolve();
    const pages: number[] = [];
    server.use(
      http.get(EVENTS_PATH, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        pages.push(page);
        await gate;
        return HttpResponse.json({
          items: events.slice((page - 1) * 10, page * 10),
          total: 25,
          page,
          pageSize: 10,
          totalPages: 3,
        });
      }),
    );
    await openDetail();
    const nav = await screen.findByRole('navigation', { name: 'Paginação do histórico' });
    expect(nav).toHaveTextContent('Página 1 de 3 · 25 eventos');
    expect(within(section()).getByText('Título: T1 → T0')).toBeInTheDocument();

    gate = new Promise((resolve) => (release = resolve));
    await userEvent.click(within(nav).getByRole('button', { name: 'Próxima' }));

    // Enquanto a página 2 não chega: página 1 na tela, aria-busy e foco no título da seção.
    expect(within(section()).getByText('Título: T1 → T0')).toBeInTheDocument();
    expect(section().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Histórico' })).toHaveFocus();

    release();
    expect(await within(section()).findByText('Título: T11 → T10')).toBeInTheDocument();
    expect(within(section()).queryByText('Título: T1 → T0')).not.toBeInTheDocument();
    expect(nav).toHaveTextContent('Página 2 de 3');
    expect(pages).toEqual([1, 2]);
    // A página não vai para a URL.
    expect(currentUrl()).toBe(`/orders/${ORDER.id}`);
  });

  it('carregando: skeleton com texto para leitor de tela', async () => {
    mockOrderApi(ORDER);
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get(EVENTS_PATH, async () => {
        await gate;
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
      }),
    );
    await openDetail();

    expect(within(section()).getByText('Carregando histórico…')).toBeInTheDocument();
    release();
    expect(await within(section()).findByText('Sem eventos registrados.')).toBeInTheDocument();
  });

  it('erro fica só na seção: o resto do detalhe continua, e "Tentar de novo" busca outra vez', async () => {
    mockOrderApi(ORDER);
    let fail = true;
    const pages = mockHistory([makeEvent({ type: 'CREATED' })], () =>
      fail ? errorBody(500, 'INTERNAL_ERROR') : undefined,
    );
    await openDetail();

    const alert = await within(section()).findByRole('alert');
    expect(pages).toEqual([1, 1]); // uma nova tentativa automática em 5xx, como no Dia 6
    // O detalhe continua utilizável.
    expect(screen.getByRole('button', { name: 'Iniciar ordem' })).toBeEnabled();
    expect(screen.getByRole('group', { name: 'Ações da ordem' })).toBeInTheDocument();

    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    expect(itemTexts(await timeline())).toEqual(['Carla Supervisora criou a ordem']);
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sem eventos: mensagem no lugar da lista, sem paginação', async () => {
    mockOrderApi(ORDER);
    mockHistory([]);
    await openDetail();

    expect(await within(section()).findByText('Sem eventos registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Histórico da ordem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginação do histórico' })).toBeNull();
  });

  describe('novo evento aparece sem recarregar a página', () => {
    it('ao mudar o status', async () => {
      mockOrderApi(ORDER, USER);
      await openDetail(USER);
      expect(itemTexts(await timeline())).toEqual(['Ana Operadora criou a ordem']);

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar ordem' }));

      await waitFor(async () =>
        expect(itemTexts(await timeline())[0]).toBe(
          'Ana Operadora iniciou a ordem (Aberta → Em andamento)',
        ),
      );
    });

    it('ao atribuir', async () => {
      mockOrderApi(ORDER, SUPERVISOR);
      await openDetail(SUPERVISOR);
      await timeline();
      const form = within(screen.getByRole('form', { name: 'Atribuir responsável' }));
      await waitFor(() => expect(form.getByLabelText('Novo responsável')).toBeEnabled());
      await userEvent.selectOptions(
        form.getByLabelText('Novo responsável'),
        'Bruno Operador (Operador)',
      );
      await userEvent.click(form.getByRole('button', { name: 'Atribuir responsável' }));

      await waitFor(async () =>
        expect(itemTexts(await timeline())[0]).toBe(
          `Carla Supervisora atribuiu a ordem a ${OTHER_OPERATOR.name} (antes: Ana Operadora)`,
        ),
      );
    });

    it('ao editar e voltar ao detalhe', async () => {
      mockOrderApi(ORDER, USER);
      await openDetail(USER);
      await timeline();
      await userEvent.click(screen.getByRole('link', { name: 'Editar ordem' }));
      const title = await screen.findByLabelText('Título');
      await userEvent.clear(title);
      await userEvent.type(title, 'Trocar filtro do ar');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

      expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
      await waitFor(async () =>
        expect(itemTexts(await timeline())[0]).toBe('Ana Operadora alterou o título'),
      );
      expect(screen.getByText('Título: Trocar filtro → Trocar filtro do ar')).toBeInTheDocument();
    });
  });

  it('ao excluir, o histórico sai do cache: nenhuma busca de histórico depois', async () => {
    mockOrderApi(ORDER, SUPERVISOR);
    const requests: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname === EVENTS_PATH) requests.push(request.method);
    });
    await openDetail(SUPERVISOR);
    await timeline();
    const before = requests.length;

    await userEvent.click(screen.getByRole('button', { name: 'Excluir ordem' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir ordem' }),
    );

    expect(await screen.findByText('Ordem excluída.')).toBeInTheDocument();
    expect(currentUrl()).toBe('/orders');
    expect(requests.length).toBe(before);
    server.events.removeAllListeners();
  });
});
