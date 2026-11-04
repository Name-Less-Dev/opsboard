import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { AuthUser } from '../features/auth/auth-context';
import type { WorkOrder, WorkOrderPage } from '../features/work-orders/labels';

// API falsa no nível da rede (MSW): cliente HTTP, TanStack Query, roteador e telas são os
// reais. Cada teste troca as respostas com `server.use(...)`.

export const USER: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ana Operadora',
  email: 'ana@opsboard.dev',
  role: 'OPERATOR',
};

export const server = setupServer(http.get('/api/auth/me', () => HttpResponse.json(USER)));

let sequence = 0;

export function makeOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    title: `Ordem ${sequence}`,
    description: null,
    priority: 'MEDIUM',
    status: 'OPEN',
    dueDate: '2099-01-01T12:00:00.000Z',
    assignee: { id: USER.id, name: USER.name },
    createdBy: { id: USER.id, name: USER.name },
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

export function makePage(
  items: WorkOrder[],
  { total = items.length, page = 1, pageSize = 20 } = {},
): WorkOrderPage {
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export function errorBody(statusCode: number, code: string, requestId = 'req-teste-123') {
  return HttpResponse.json(
    {
      statusCode,
      code,
      message: 'texto da API',
      path: '/work-orders',
      timestamp: '2026-11-04T12:00:00.000Z',
      requestId,
    },
    { status: statusCode },
  );
}

/**
 * Responde `GET /work-orders` com `respond` e guarda a query de cada requisição, para o teste
 * conferir o que saiu para a API.
 */
export function mockWorkOrders(respond: (query: URLSearchParams) => Response | Promise<Response>) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/work-orders', ({ request }) => {
      const query = new URL(request.url).searchParams;
      requests.push(query);
      return respond(query);
    }),
  );
  return requests;
}
