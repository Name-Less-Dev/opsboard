import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/decorators/current-user.decorator';
import { requestPath } from '../request-path';

export type RequestLogEntry = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId?: string;
  userId?: string;
};

// Lista fechada de campos: corpo, headers (com o token) e e-mail nunca entram, nem por engano.
export function formatRequestLog(entry: RequestLogEntry): string {
  return [
    entry.method,
    entry.path,
    entry.statusCode,
    `${entry.durationMs}ms`,
    `requestId=${entry.requestId ?? '-'}`,
    `userId=${entry.userId ?? '-'}`,
  ].join(' ');
}

const logger = new Logger('HTTP');
const tracked = new WeakSet<Request>();

// Registra no `finish`, quando o status já é conhecido e o JwtStrategy já preencheu `req.user`.
// Idempotente, como o ensureRequestId: o filtro de erros chama de novo para cobrir requisições
// barradas antes do middleware (JSON malformado); nesse caso a duração conta a partir do filtro.
export function trackRequest(req: Request, res: Response): void {
  if (tracked.has(req)) return;
  tracked.add(req);
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const line = formatRequestLog({
      method: req.method,
      path: requestPath(req),
      statusCode: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
      requestId: req.requestId,
      userId: (req as AuthenticatedRequest).user?.id,
    });
    // 4xx e 5xx como warn para destacar; a stack de um 5xx sai no log do filtro de erros.
    if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
}

// Depende do requestIdMiddleware ter rodado antes.
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  trackRequest(req, res);
  next();
}
