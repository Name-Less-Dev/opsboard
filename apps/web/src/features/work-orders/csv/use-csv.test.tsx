import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../../lib/query-client';
import { setToken } from '../../../lib/session';
import { server } from '../../../test/api-mock';
import { jsonResponse, mockImportApi } from '../../../test/import-api-mock';
import { dashboardKeys } from '../../dashboard/dashboard-keys';
import { DEFAULT_LIST_PARAMS } from '../list-params';
import { workOrderKeys } from '../use-work-orders';
import {
  downloadTemplate,
  useExportWorkOrders,
  useImportWorkOrders,
  useValidateImport,
} from './use-csv';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

/** Intercepta o link temporário: guarda o Blob e o nome que o navegador baixaria. */
function captureDownloads() {
  const blobs = new Map<string, Blob>();
  let counter = 0;
  // O jsdom não implementa os dois métodos: só eles são trocados (o MSW usa o construtor de URL).
  const createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:teste/${++counter}`;
    blobs.set(url, blob);
    return url;
  });
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL: revoke });
  const saved: { filename: string; blob: Blob | undefined }[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ filename: this.download, blob: blobs.get(this.href) });
  });
  return { saved, click, revoke };
}

function setup() {
  setToken('token-de-teste');
  const client = createQueryClient();
  client.setQueryData(dashboardKeys.summary(), { cached: true });
  client.setQueryData(workOrderKeys.list(DEFAULT_LIST_PARAMS), { cached: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const csvFile = () =>
  new File(['title;priority\r\nAbc;LOW\r\n'], 'ordens.csv', { type: 'text/csv' });

describe('useExportWorkOrders', () => {
  it('pede a exportação com os filtros e sem paginação, e baixa com o nome do cabeçalho', async () => {
    const { saved, revoke } = captureDownloads();
    const queries: URLSearchParams[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('/api/work-orders/export', async ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        await gate;
        return new HttpResponse('id;title', {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="opsboard-ordens-20261105-1430.csv"',
          },
        });
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useExportWorkOrders(), { wrapper });

    act(() => {
      result.current.mutate({
        ...DEFAULT_LIST_PARAMS,
        status: ['OPEN'],
        q: 'filtro',
        page: 3,
        pageSize: 50,
      });
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(Object.fromEntries(queries[0])).toEqual({
      q: 'filtro',
      status: 'OPEN',
      sortBy: 'createdAt',
      order: 'desc',
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toBe('opsboard-ordens-20261105-1430.csv');
    expect(await saved[0].blob?.text()).toBe('id;title');
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:teste/1'));
  });

  it('erro da API chega pelo code e nada é baixado', async () => {
    const { saved } = captureDownloads();
    server.use(
      http.get('/api/work-orders/export', () =>
        HttpResponse.json(
          { statusCode: 422, code: 'EXPORT_TOO_LARGE', message: 'x', requestId: 'r' },
          { status: 422 },
        ),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useExportWorkOrders(), { wrapper });
    act(() => result.current.mutate(DEFAULT_LIST_PARAMS));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'EXPORT_TOO_LARGE' });
    expect(saved).toHaveLength(0);
  });
});

describe('importação', () => {
  it('validar envia dryRun=true com o arquivo no campo file e não invalida nada', async () => {
    const report = {
      dryRun: true,
      valid: true,
      totalRows: 1,
      validRows: 1,
      totalErrors: 0,
      errors: [],
    };
    const calls = mockImportApi(() => jsonResponse(report));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useValidateImport(), { wrapper });
    await act(() => result.current.mutateAsync(csvFile()));

    await waitFor(() => expect(result.current.data).toEqual(report));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ dryRun: 'true', contentType: null });
    expect(calls[0].file?.name).toBe('ordens.csv');
    expect(await calls[0].file?.text()).toContain('Abc;LOW');
    expect(client.getQueryState(workOrderKeys.list(DEFAULT_LIST_PARAMS))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(dashboardKeys.summary())?.isInvalidated).toBe(false);
  });

  it('importar envia dryRun=false e invalida lista e painel', async () => {
    const calls = mockImportApi(() => jsonResponse({ dryRun: false, imported: 1 }, 201));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useImportWorkOrders(), { wrapper });
    await act(() => result.current.mutateAsync(csvFile()));

    await waitFor(() => expect(result.current.data).toEqual({ dryRun: false, imported: 1 }));
    expect(calls.map((call) => call.dryRun)).toEqual(['false']);
    expect(client.getQueryState(workOrderKeys.list(DEFAULT_LIST_PARAMS))?.isInvalidated).toBe(true);
    expect(client.getQueryState(dashboardKeys.summary())?.isInvalidated).toBe(true);
  });
});

describe('downloadTemplate', () => {
  it('baixa o modelo com BOM, cabeçalho e separador `;`, sem chamar a API', async () => {
    const { saved } = captureDownloads();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    downloadTemplate(new Date(2026, 10, 5, 12));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(saved[0].filename).toBe('opsboard-modelo-importacao.csv');
    const bytes = new Uint8Array(await (saved[0].blob as Blob).arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes.subarray(3));
    expect(text.split('\r\n')[0]).toBe('title;description;priority;dueDate;assigneeEmail');
    expect(saved[0].blob?.type).toBe('text/csv;charset=utf-8');
  });
});
