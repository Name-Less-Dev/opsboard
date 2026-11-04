import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/** No máximo uma nova tentativa, e só no que pode ser passageiro. */
export const MAX_RETRIES = 1;

/**
 * Política de retry: erro 4xx é resposta definitiva (dado inválido, sem permissão, não
 * existe), repetir só gasta requisição. Falha de rede e 5xx podem ser passageiras.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiError)) return false;
  return error.statusCode === 0 || error.statusCode >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Desligado: em painel interno a pessoa alterna muito entre abas, e cada volta
        // dispararia uma requisição. Os dados se atualizam ao mudar filtro ou página.
        refetchOnWindowFocus: false,
      },
    },
  });
}
