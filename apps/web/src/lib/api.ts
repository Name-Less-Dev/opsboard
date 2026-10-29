// Cliente HTTP mínimo. Todas as chamadas usam o prefixo /api, que o proxy
// (Vite em dev, nginx no Docker) encaminha para a API.

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// O NestJS devolve erros no formato { statusCode, message, error }.
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
      return body.message
    }
  } catch {
    // Corpo vazio ou não-JSON (ex.: página de erro do proxy).
  }
  return response.statusText || 'Erro desconhecido'
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal })
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response))
  }
  // O tipo T é uma promessa do chamador sobre o formato da resposta;
  // validação em runtime (ex.: zod) fica para quando houver dados de usuário.
  return (await response.json()) as T
}
