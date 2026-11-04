import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, setUnauthorizedHandler } from './api';
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
});
