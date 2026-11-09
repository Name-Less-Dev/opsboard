import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiDelete,
  apiDownload,
  apiGet,
  apiPatch,
  apiUpload,
  apiBaseUrl,
  setUnauthorizedHandler,
} from './api';
import { getToken, setToken } from './session';

const REQUEST_ID = '0b6d2a4e-3f1c-4d9a-8e7b-5c2f1a0d9e8b';

function respondWith(response: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function errorResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-request-id': REQUEST_ID },
  });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('a promessa deveria ter falhado');
}

afterEach(() => setUnauthorizedHandler(() => {}));

describe('apiBaseUrl', () => {
  it.each([
    [{}, '/api'],
    [{ VITE_API_URL: '' }, '/api'],
    [{ VITE_API_URL: '   ' }, '/api'],
    [{ VITE_API_URL: 'https://opsboard-api.onrender.com' }, 'https://opsboard-api.onrender.com'],
    [{ VITE_API_URL: 'https://opsboard-api.onrender.com/' }, 'https://opsboard-api.onrender.com'],
    [{ VITE_API_URL: ' http://localhost:3000// ' }, 'http://localhost:3000'],
  ])('%j → %s', (env, expected) => {
    expect(apiBaseUrl(env)).toBe(expected);
  });
});

describe('apiGet', () => {
  it('chama /api + caminho com o token no header', async () => {
    setToken('token-de-teste');
    const fetchMock = respondWith(new Response(JSON.stringify({ ok: true })));
    await expect(apiGet('/work-orders?page=2')).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/work-orders?page=2');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-de-teste');
  });

  it('erro no formato da API vira ApiError com todos os campos', async () => {
    const details = [{ field: 'dueTo', messages: ['dueTo must not be before dueFrom'] }];
    respondWith(
      errorResponse(400, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details,
        path: '/work-orders',
        timestamp: '2026-11-04T12:00:00.000Z',
        requestId: REQUEST_ID,
      }),
    );
    const error = await caught(apiGet('/work-orders'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details,
      requestId: REQUEST_ID,
    });
  });

  it('sem details no corpo, details é lista vazia', async () => {
    respondWith(
      errorResponse(500, {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'x',
        requestId: 'r1',
      }),
    );
    expect(await caught(apiGet('/x'))).toMatchObject({ details: [], requestId: 'r1' });
  });

  it('código desconhecido passa adiante sem quebrar', async () => {
    respondWith(errorResponse(418, { statusCode: 418, code: 'TEAPOT', message: 'x' }));
    expect(await caught(apiGet('/x'))).toMatchObject({ statusCode: 418, code: 'TEAPOT' });
  });

  it.each([
    ['HTML do proxy (502)', new Response('<html>Bad Gateway</html>', { status: 502 })],
    ['corpo vazio (500 do proxy do Vite)', new Response(null, { status: 500 })],
    ['JSON fora do formato', new Response(JSON.stringify({ error: 'x' }), { status: 503 })],
  ])('resposta fora do formato vira BAD_RESPONSE: %s', async (_name, response) => {
    respondWith(response);
    expect(await caught(apiGet('/x'))).toMatchObject({
      statusCode: response.status,
      code: 'BAD_RESPONSE',
      requestId: null,
    });
  });

  it('fora do formato, aproveita o requestId do header', async () => {
    respondWith(new Response('', { status: 500, headers: { 'x-request-id': REQUEST_ID } }));
    expect(await caught(apiGet('/x'))).toMatchObject({ requestId: REQUEST_ID });
  });

  it('sem resposta (falha de rede) vira NETWORK_ERROR com status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await caught(apiGet('/x'))).toMatchObject({
      statusCode: 0,
      code: 'NETWORK_ERROR',
      requestId: null,
    });
  });

  it('cancelamento não vira ApiError', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abort)),
    );
    expect(await caught(apiGet('/x', controller.signal))).toBe(abort);
  });

  it('401 com token limpa a sessão e chama o handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setToken('expirado');
    respondWith(errorResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }));
    expect(await caught(apiGet('/work-orders'))).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(handler).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });

  it('401 sem token (senha errada no login) não chama o handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respondWith(errorResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }));
    await caught(apiGet('/auth/login'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('PATCH envia JSON com o método certo', async () => {
    const fetchMock = respondWith(new Response(JSON.stringify({ id: '1' })));
    await expect(apiPatch('/work-orders/1/status', { status: 'DONE' })).resolves.toEqual({
      id: '1',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/work-orders/1/status');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"status":"DONE"}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('DELETE com 204 resolve sem ler corpo', async () => {
    const fetchMock = respondWith(new Response(null, { status: 204 }));
    await expect(apiDelete('/work-orders/1')).resolves.toBeUndefined();
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE');
  });
});

describe('apiUpload', () => {
  it('envia FormData com POST e o token, sem definir Content-Type', async () => {
    setToken('token-de-teste');
    const fetchMock = respondWith(new Response(JSON.stringify({ dryRun: false, imported: 2 })));
    const form = new FormData();
    form.append('file', new File(['title;priority'], 'ordens.csv', { type: 'text/csv' }));

    await expect(apiUpload('/work-orders/import?dryRun=false', form)).resolves.toEqual({
      dryRun: false,
      imported: 2,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/work-orders/import?dryRun=false');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer token-de-teste');
  });

  it('IMPORT_INVALID: erros por linha em rowErrors e o total real, details vazio', async () => {
    const rows = [{ row: 7, column: 'priority', code: 'INVALID_ENUM', message: 'm' }];
    respondWith(
      errorResponse(422, {
        statusCode: 422,
        code: 'IMPORT_INVALID',
        message: 'x',
        details: rows,
        totalErrors: 150,
        requestId: REQUEST_ID,
      }),
    );
    const error = await caught(apiUpload('/work-orders/import', new FormData()));
    expect(error).toMatchObject({
      statusCode: 422,
      code: 'IMPORT_INVALID',
      rowErrors: rows,
      totalErrors: 150,
      details: [],
    });
  });

  it('VALIDATION_ERROR continua indo para details, sem rowErrors', async () => {
    const details = [{ field: 'dryRun', messages: ['dryRun must be a boolean value'] }];
    respondWith(
      errorResponse(400, { statusCode: 400, code: 'VALIDATION_ERROR', message: 'x', details }),
    );
    const error = await caught(apiUpload('/work-orders/import', new FormData()));
    expect(error).toMatchObject({ details, rowErrors: [], totalErrors: 0 });
  });
});

describe('apiDownload', () => {
  it('lê o corpo como Blob e devolve o Content-Disposition', async () => {
    setToken('token-de-teste');
    const fetchMock = respondWith(
      new Response('id;title', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="opsboard-ordens-20261105-1430.csv"',
        },
      }),
    );
    const { blob, contentDisposition } = await apiDownload('/work-orders/export?status=OPEN');
    expect(await blob.text()).toBe('id;title');
    expect(contentDisposition).toBe('attachment; filename="opsboard-ordens-20261105-1430.csv"');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/work-orders/export?status=OPEN');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-de-teste');
  });

  it('erro em JSON vira ApiError pelo code, mesmo sendo uma rota de arquivo', async () => {
    respondWith(
      errorResponse(422, {
        statusCode: 422,
        code: 'EXPORT_TOO_LARGE',
        message: 'x',
        requestId: REQUEST_ID,
      }),
    );
    const error = await caught(apiDownload('/work-orders/export'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 422, code: 'EXPORT_TOO_LARGE' });
  });

  it('401 com token derruba a sessão, como nas outras chamadas', async () => {
    setToken('token-de-teste');
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respondWith(errorResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }));
    await caught(apiDownload('/work-orders/export'));
    expect(handler).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });
});
