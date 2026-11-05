import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createQueryClient } from '../../lib/query-client';
import { setToken } from '../../lib/session';
import { makeOrder, server } from '../../test/api-mock';
import { mockOrderApi } from '../../test/order-api-mock';
import { dashboardKeys } from '../dashboard/dashboard-keys';
import {
  useAssignWorkOrder,
  useChangeStatus,
  useCreateWorkOrder,
  useDeleteWorkOrder,
  useUpdateWorkOrder,
} from './use-work-order';
import { workOrderKeys } from './use-work-orders';
import { DEFAULT_LIST_PARAMS } from './list-params';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ORDER = makeOrder();
const OTHER_ID = '99999999-9999-4999-8999-999999999999';

/** Cliente com painel e lista já no cache (como se as telas tivessem sido abertas). */
function setup() {
  setToken('token-de-teste');
  mockOrderApi(ORDER);
  server.use(http.post('/api/work-orders', () => HttpResponse.json(ORDER, { status: 201 })));
  const client = createQueryClient();
  client.setQueryData(dashboardKeys.summary(), { cached: true });
  client.setQueryData(workOrderKeys.list(DEFAULT_LIST_PARAMS), { cached: true });
  client.setQueryData(workOrderKeys.historyPage(ORDER.id, 1), { cached: true });
  client.setQueryData(workOrderKeys.historyPage(ORDER.id, 2), { cached: true });
  client.setQueryData(workOrderKeys.historyPage(OTHER_ID, 1), { cached: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const isInvalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated;

describe('mutações de ordem invalidam lista e painel', () => {
  // Cada caso devolve a mutação já com as variáveis certas para o hook dela.
  const cases: [string, () => () => Promise<unknown>][] = [
    [
      'criar',
      () => {
        const { mutateAsync } = useCreateWorkOrder();
        return () =>
          mutateAsync({ title: 'Nova', priority: 'LOW', dueDate: '2099-01-01T00:00:00.000Z' });
      },
    ],
    [
      'editar',
      () => {
        const { mutateAsync } = useUpdateWorkOrder(ORDER.id);
        return () => mutateAsync({ title: 'Outro título' });
      },
    ],
    [
      'mudar status',
      () => {
        const { mutateAsync } = useChangeStatus(ORDER.id);
        return () => mutateAsync('IN_PROGRESS');
      },
    ],
    [
      'atribuir',
      () => {
        const { mutateAsync } = useAssignWorkOrder(ORDER.id);
        return () => mutateAsync(null);
      },
    ],
    [
      'excluir',
      () => {
        const { mutateAsync } = useDeleteWorkOrder(ORDER.id);
        return () => mutateAsync();
      },
    ],
  ];

  it.each(cases)('%s', async (_name, useMutate) => {
    const { client, wrapper } = setup();
    const { result } = renderHook(useMutate, { wrapper });
    expect(isInvalidated(client, dashboardKeys.summary())).toBe(false);

    await act(() => result.current());

    expect(isInvalidated(client, dashboardKeys.summary())).toBe(true);
    expect(isInvalidated(client, workOrderKeys.list(DEFAULT_LIST_PARAMS))).toBe(true);
  });

  it('409 numa mutação também invalida o painel (os dados mudaram no servidor)', async () => {
    const { client, wrapper } = setup();
    server.use(
      http.patch(`/api/work-orders/${ORDER.id}/status`, () =>
        HttpResponse.json({ statusCode: 409, code: 'INVALID_TRANSITION' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useChangeStatus(ORDER.id), { wrapper });
    result.current.mutate('DONE');

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(isInvalidated(client, dashboardKeys.summary())).toBe(true));
  });

  describe('histórico da ordem', () => {
    const historyState = (client: QueryClient, id: string, page: number) =>
      client.getQueryState(workOrderKeys.historyPage(id, page));

    it.each(cases.filter(([name]) => ['editar', 'mudar status', 'atribuir'].includes(name)))(
      '%s invalida todas as páginas do histórico daquela ordem, e só dela',
      async (_name, useMutate) => {
        const { client, wrapper } = setup();
        const { result } = renderHook(useMutate, { wrapper });
        await act(() => result.current());

        expect(historyState(client, ORDER.id, 1)?.isInvalidated).toBe(true);
        expect(historyState(client, ORDER.id, 2)?.isInvalidated).toBe(true);
        expect(historyState(client, OTHER_ID, 1)?.isInvalidated).toBe(false);
      },
    );

    it('criar não mexe em histórico nenhum', async () => {
      const { client, wrapper } = setup();
      const create = cases.find(([name]) => name === 'criar')![1];
      const { result } = renderHook(create, { wrapper });
      await act(() => result.current());

      expect(historyState(client, ORDER.id, 1)?.isInvalidated).toBe(false);
    });

    it('excluir remove o histórico daquela ordem do cache', async () => {
      const { client, wrapper } = setup();
      const remove = cases.find(([name]) => name === 'excluir')![1];
      const { result } = renderHook(remove, { wrapper });
      await act(() => result.current());

      expect(historyState(client, ORDER.id, 1)).toBeUndefined();
      expect(historyState(client, ORDER.id, 2)).toBeUndefined();
      expect(historyState(client, OTHER_ID, 1)).toBeDefined();
    });
  });
});
