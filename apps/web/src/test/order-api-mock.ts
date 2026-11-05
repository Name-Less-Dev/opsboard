import { http, HttpResponse } from 'msw';
import type { WorkOrderEvent } from '../features/work-orders/history/history-types';
import type { WorkOrder, WorkOrderStatus } from '../features/work-orders/labels';
import { makePage, server, USER, USERS } from './api-mock';

export type RecordedRequest = { method: string; path: string; body: unknown };

let eventSequence = 0;

/**
 * Uma ordem "no servidor": o GET devolve o estado atual e os PATCH/DELETE o alteram, como a
 * API faria, gravando o evento no histórico (`GET .../events`, mais recente primeiro). Cada
 * requisição fica em `requests`, para o teste conferir o que saiu.
 */
export function mockOrderApi(initial: WorkOrder, actor: { id: string; name: string } = USER) {
  let order: WorkOrder | null = { ...initial };
  const requests: RecordedRequest[] = [];
  const path = `/api/work-orders/${initial.id}`;
  const actorRef = { id: actor.id, name: actor.name };
  const base = () => ({
    id: `e0000000-0000-4000-8000-${String((eventSequence += 1)).padStart(12, '0')}`,
    actor: actorRef,
    fromStatus: null,
    toStatus: null,
    createdAt: new Date(
      Date.parse('2026-11-01T12:00:00.000Z') + eventSequence * 60_000,
    ).toISOString(),
  });
  const events: WorkOrderEvent[] = [
    { ...base(), type: 'CREATED', toStatus: 'OPEN', details: null },
  ];
  const record = (event: WorkOrderEvent) => events.unshift(event);

  const recordRequest = async (request: Request) => {
    const body: unknown = request.method === 'DELETE' ? null : await request.clone().json();
    requests.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body;
  };
  const current = () =>
    order ? HttpResponse.json(order) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });

  server.use(
    http.get(path, () => current()),
    http.get(`${path}/events`, ({ request }) => {
      if (!order) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
      const query = new URL(request.url).searchParams;
      const page = Number(query.get('page') ?? 1);
      const pageSize = Number(query.get('pageSize') ?? 20);
      return HttpResponse.json({
        items: events.slice((page - 1) * pageSize, page * pageSize),
        total: events.length,
        page,
        pageSize,
        totalPages: Math.ceil(events.length / pageSize),
      });
    }),
    http.get('/api/users', () => HttpResponse.json(USERS)),
    http.get('/api/work-orders', () => HttpResponse.json(makePage(order ? [order] : []))),
    http.patch(`${path}/status`, async ({ request }) => {
      const { status } = (await recordRequest(request)) as { status: WorkOrderStatus };
      if (order) {
        record({
          ...base(),
          type: 'STATUS_CHANGED',
          fromStatus: order.status,
          toStatus: status,
          details: null,
        });
      }
      order = order && { ...order, status };
      return current();
    }),
    http.patch(`${path}/assignee`, async ({ request }) => {
      const { assigneeId } = (await recordRequest(request)) as { assigneeId: string | null };
      const assignee = USERS.find((user) => user.id === assigneeId);
      const ref = (user?: { id: string; name: string } | null) =>
        user ? { id: user.id, name: user.name } : null;
      if (order) {
        record({
          ...base(),
          type: 'ASSIGNED',
          details: { from: ref(order.assignee), to: ref(assignee) },
        });
      }
      order = order && {
        ...order,
        assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      };
      return current();
    }),
    http.patch(path, async ({ request }) => {
      const changes = (await recordRequest(request)) as Partial<WorkOrder>;
      if (order) {
        const fields = (['title', 'description', 'priority', 'dueDate'] as const).filter(
          (field) => field in changes,
        );
        record({
          ...base(),
          type: 'UPDATED',
          details: {
            changes: fields.map((field) =>
              field === 'description'
                ? { field }
                : // Mesmo formato da API: antes e depois do campo.
                  ({ field, from: order![field], to: changes[field] } as never),
            ),
          },
        });
      }
      order = order && { ...order, ...changes };
      return current();
    }),
    http.delete(path, async ({ request }) => {
      await recordRequest(request);
      order = null;
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return {
    requests,
    events,
    /** Simula outra aba (ou pessoa) mudando a ordem no servidor. */
    setServerOrder(changes: Partial<WorkOrder>) {
      order = order && { ...order, ...changes };
    },
  };
}
