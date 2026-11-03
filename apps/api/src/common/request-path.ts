import type { Request } from 'express';

// Caminho sem a query string: ela pode carregar texto de busca, que não vai para log nem resposta.
export function requestPath(req: Request): string {
  return req.originalUrl.split('?')[0];
}
