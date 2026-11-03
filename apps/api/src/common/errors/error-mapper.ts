import { HttpException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DomainException } from './domain.exception';
import type { ErrorCode, ValidationDetail } from './error-code';

export type MappedError = {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ValidationDetail[];
  // true quando o detalhe original precisa ir para o log (5xx): a resposta nunca o carrega.
  logInternally: boolean;
};

// Texto por status para erros do framework (guards, pipes, rota inexistente, throttler).
// O texto original do Nest é ignorado: vem em inglês e às vezes expõe detalhes ("Cannot GET /x").
const FRAMEWORK_ERRORS: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'Requisição inválida' },
  401: { code: 'UNAUTHORIZED', message: 'Autenticação necessária' },
  403: { code: 'FORBIDDEN', message: 'Sem permissão para esta ação' },
  404: { code: 'NOT_FOUND', message: 'Recurso não encontrado' },
  409: { code: 'CONFLICT', message: 'Conflito com o estado atual do recurso' },
  429: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Aguarde e tente novamente' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço indisponível' },
};

const PRISMA_ERRORS: Record<string, { statusCode: number; code: ErrorCode; message: string }> = {
  P2025: { statusCode: 404, code: 'NOT_FOUND', message: 'Registro não encontrado' },
  P2002: { statusCode: 409, code: 'CONFLICT', message: 'Já existe um registro com estes dados' },
  P2003: { statusCode: 409, code: 'CONFLICT', message: 'Registro relacionado não encontrado' },
};

const INTERNAL: MappedError = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'Erro interno. Se persistir, informe o requestId ao suporte',
  logInternally: true,
};

// Converte qualquer erro no formato público. A ordem importa: DomainException também é
// HttpException, então precisa ser testada antes.
export function mapError(error: unknown): MappedError {
  if (error instanceof DomainException) {
    return {
      statusCode: error.getStatus(),
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      logInternally: error.getStatus() >= 500,
    };
  }

  if (error instanceof HttpException) {
    const statusCode = error.getStatus();
    if (statusCode >= 500 && statusCode !== 503) return INTERNAL;
    const known = FRAMEWORK_ERRORS[statusCode];
    const mapped = known ?? {
      code: 'HTTP_ERROR' as const,
      message: 'Requisição não pôde ser atendida',
    };
    return {
      statusCode,
      ...mapped,
      ...(mapped.code === 'VALIDATION_ERROR' ? { details: [] } : {}),
      logInternally: statusCode >= 500,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const known = PRISMA_ERRORS[error.code];
    return known ? { ...known, logInternally: false } : INTERNAL;
  }

  return INTERNAL;
}
