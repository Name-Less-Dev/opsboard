import { clearToken, getToken } from './session';

// Cliente HTTP mínimo. Todas as chamadas usam o prefixo /api, que o proxy
// (Vite em dev, nginx no Docker) encaminha para a API.

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};

// O AuthProvider registra aqui o que fazer quando a sessão cai; assim este módulo não
// precisa conhecer React nem o roteador.
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

// O NestJS devolve erros no formato { statusCode, message, error }.
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  } catch {
    // Corpo vazio ou não-JSON (ex.: página de erro do proxy).
  }
  return response.statusText || 'Erro desconhecido';
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, { ...init, headers });

  if (!response.ok) {
    // Só derruba a sessão se a requisição levava token. Um 401 sem token é, por exemplo,
    // senha errada no login: quem chamou trata o erro e a tela continua onde está.
    if (response.status === 401 && token) {
      clearToken();
      onUnauthorized();
    }
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  // O tipo T é uma promessa do chamador sobre o formato da resposta;
  // validação em runtime (ex.: zod) fica para quando houver dados de usuário.
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
