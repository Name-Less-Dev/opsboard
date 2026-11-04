import { http, HttpResponse } from 'msw';
import type { WorkOrder, WorkOrderStatus } from '../features/work-orders/labels';
import { makePage, server, USERS } from './api-mock';

export type RecordedRequest = { method: string; path: string; body: unknown };

/**
 * Uma ordem "no servidor": o GET devolve o estado atual e os PATCH/DELETE o alteram, como a
 * API faria. Cada requisição fica em `requests`, para o teste conferir o que saiu.
 */
export function mockOrderApi(initial: WorkOrder) {
  let order: WorkOrder | null = { ...initial };
  const requests: RecordedRequest[] = [];
  const path = `/api/work-orders/${initial.id}`;

  const record = async (request: Request) => {
    const body: unknown = request.method === 'DELETE' ? null : await request.clone().json();
    requests.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body;
  };
  const current = () =>
    order ? HttpResponse.json(order) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });

  server.use(
    http.get(path, () => current()),
    http.get('/api/users', () => HttpResponse.json(USERS)),
    http.get('/api/work-orders', () => HttpResponse.json(makePage(order ? [order] : []))),
    http.patch(`${path}/status`, async ({ request }) => {
      const { status } = (await record(request)) as { status: WorkOrderStatus };
      order = order && { ...order, status };
      return current();
    }),
    http.patch(`${path}/assignee`, async ({ request }) => {
      const { assigneeId } = (await record(request)) as { assigneeId: string | null };
      const assignee = USERS.find((user) => user.id === assigneeId);
      order = order && {
        ...order,
        assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      };
      return current();
    }),
    http.patch(path, async ({ request }) => {
      const changes = (await record(request)) as Partial<WorkOrder>;
      order = order && { ...order, ...changes };
      return current();
    }),
    http.delete(path, async ({ request }) => {
      await record(request);
      order = null;
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return {
    requests,
    /** Simula outra aba (ou pessoa) mudando a ordem no servidor. */
    setServerOrder(changes: Partial<WorkOrder>) {
      order = order && { ...order, ...changes };
    },
  };
}
