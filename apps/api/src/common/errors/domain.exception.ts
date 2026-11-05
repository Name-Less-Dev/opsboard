import { HttpException } from '@nestjs/common';
import {
  type DomainErrorCode,
  ERROR_STATUS,
  type ImportErrorDetail,
  type ValidationDetail,
} from './error-code';

// Erro que o nosso código lança de propósito: tem `code` estável e mensagem em português.
// Herda de HttpException para o Nest ainda responder com o status certo se o filtro global faltar.
export class DomainException extends HttpException {
  readonly code: DomainErrorCode;
  readonly details?: ValidationDetail[] | ImportErrorDetail[];

  // `cause` é o erro original (ex.: falha do banco no /health): vai para o log, nunca para a resposta.
  constructor(
    code: DomainErrorCode,
    message: string,
    details?: ValidationDetail[] | ImportErrorDetail[],
    cause?: unknown,
  ) {
    super(message, ERROR_STATUS[code], cause === undefined ? undefined : { cause });
    this.code = code;
    // details só faz sentido em VALIDATION_ERROR e IMPORT_INVALID; nos outros é ignorado.
    this.details = DETAIL_CODES.has(code) ? (details ?? []) : undefined;
  }
}

const DETAIL_CODES = new Set<DomainErrorCode>(['VALIDATION_ERROR', 'IMPORT_INVALID']);

/** 422 da importação: até 100 linhas em `details` e o total real em `totalErrors`. */
export class ImportInvalidException extends DomainException {
  constructor(
    errors: ImportErrorDetail[],
    readonly totalErrors: number,
  ) {
    super(
      'IMPORT_INVALID',
      `O arquivo tem ${totalErrors} ${totalErrors === 1 ? 'erro' : 'erros'}; nenhuma ordem foi importada`,
      errors,
    );
  }
}

export function validationError(details: ValidationDetail[], message = 'Dados inválidos') {
  return new DomainException('VALIDATION_ERROR', message, details);
}
