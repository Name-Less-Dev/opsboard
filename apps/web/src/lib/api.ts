import type { components } from './api-types';
import { clearToken, getToken } from './session';

// Cliente HTTP mínimo sobre `fetch`. Todas as chamadas usam o prefixo /api, que o proxy
// (Vite em dev, nginx no Docker) encaminha para a API.

export type ServerErrorCode = components['schemas']['ErrorCode'];
export type ValidationDetail = components['schemas']['ValidationDetailDto'];

/**
 * Códigos que só o cliente produz:
 * - `NETWORK_ERROR`: o `fetch` falhou sem resposta (sem rede, servidor fora do ar, CORS).
 * - `BAD_RESPONSE`: veio uma resposta de erro fora do formato da API, como a página do proxy
 *   quando a API caiu (502 do nginx) ou um 500 vazio do proxy do Vite.
 */
export type ClientErrorCode = 'NETWORK_ERROR' | 'BAD_RESPONSE';
export type ApiErrorCode = ServerErrorCode | ClientErrorCode;

export class ApiError extends Error {
  /** Status HTTP; 0 quando não houve resposta. */
  readonly statusCode: number;
  /**
   * `string` e não só `ApiErrorCode`: uma API mais nova pode mandar um código que este front
   * não conhece, e a tela cai no texto padrão em vez de quebrar.
   */
  readonly code: ApiErrorCode | (string & {});
  readonly details: ValidationDetail[];
  readonly requestId: string | null;

  constructor(init: {
    statusCode: number;
    code: ApiError['code'];
    message: string;
    details?: ValidationDetail[];
    requestId?: string | null;
  }) {
    // `message` é o texto da API, útil para depurar; a tela usa `code` (lib/error-messages.ts).
    super(init.message);
    this.name = 'ApiError';
    this.statusCode = init.statusCode;
    this.code = init.code;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
  }
}

let onUnauthorized: () => void = () => {};

// O AuthProvider registra aqui o que fazer quando a sessão cai; assim este módulo não
// precisa conhecer React nem o roteador.
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

type ErrorBody = {
  code: string;
  message: string;
  details?: ValidationDetail[];
  requestId?: string;
};

function isErrorBody(body: unknown): body is ErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string' &&
    'message' in body &&
    typeof body.message === 'string'
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  // O header vale mesmo quando o corpo não é JSON (o middleware da API sempre o envia).
  const headerRequestId = response.headers.get('x-request-id');
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Corpo vazio ou não-JSON (ex.: página de erro do proxy).
  }
  if (!isErrorBody(body)) {
    return new ApiError({
      statusCode: response.status,
      code: 'BAD_RESPONSE',
      message: response.statusText || 'Resposta fora do formato de erro da API',
      requestId: headerRequestId,
    });
  }
  return new ApiError({
    statusCode: response.status,
    code: body.code,
    message: body.message,
    details: Array.isArray(body.details) ? body.details : [],
    requestId: body.requestId ?? headerRequestId,
  });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch (error) {
    // Cancelamento é intencional (o TanStack Query cancela ao trocar de filtro): não é erro.
    if (init.signal?.aborted) throw error;
    throw new ApiError({ statusCode: 0, code: 'NETWORK_ERROR', message: 'Falha de rede' });
  }

  if (!response.ok) {
    // Só derruba a sessão se a requisição levava token. Um 401 sem token é, por exemplo,
    // senha errada no login: quem chamou trata o erro e a tela continua onde está.
    if (response.status === 401 && token) {
      clearToken();
      onUnauthorized();
    }
    throw await toApiError(response);
  }
  // 204 (DELETE) não tem corpo: `response.json()` lançaria erro.
  if (response.status === 204) return undefined as T;
  // O tipo T é uma promessa do chamador sobre o formato da resposta;
  // validação em runtime (ex.: zod) fica para quando houver dados de usuário.
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

function withJsonBody(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, withJsonBody('POST', body));
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, withJsonBody('PATCH', body));
}

export function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' });
}
