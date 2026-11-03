import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export const REQUEST_ID_HEADER = 'x-request-id';

// Só reaproveita o id do cliente se for curto e sem caracteres especiais: o valor vai para o log,
// e aceitar qualquer texto permitiria quebrar linhas ou forjar entradas no log.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

// Idempotente: o middleware chama no início da requisição, e o filtro de erros chama de novo para
// cobrir erros que acontecem antes dele (ex.: JSON malformado, que o body-parser rejeita antes).
export function ensureRequestId(req: Request, res: Response): string {
  if (req.requestId) return req.requestId;
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  ensureRequestId(req, res);
  next();
}
