import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ensureRequestId } from '../request-id/request-id';
import { mapError } from './error-mapper';

// Único ponto que escreve respostas de erro: tudo que é lançado passa pelo mapError.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = ensureRequestId(req, res);
    // Sem a query string: ela pode carregar texto de busca, e o formato documentado é só o caminho.
    const path = req.originalUrl.split('?')[0];
    const { logInternally, ...body } = mapError(error);

    if (logInternally) {
      // Só método, caminho, id e o erro: nunca corpo, headers ou token.
      const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
      this.logger.error(
        `${req.method} ${path} ${body.statusCode} requestId=${requestId}`,
        cause instanceof Error ? cause.stack : String(cause),
      );
    }

    res.status(body.statusCode).json({
      ...body,
      path,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
