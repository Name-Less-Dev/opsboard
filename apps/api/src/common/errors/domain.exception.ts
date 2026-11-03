import { HttpException } from '@nestjs/common';
import { type DomainErrorCode, ERROR_STATUS, type ValidationDetail } from './error-code';

// Erro que o nosso código lança de propósito: tem `code` estável e mensagem em português.
// Herda de HttpException para o Nest ainda responder com o status certo se o filtro global faltar.
export class DomainException extends HttpException {
  readonly code: DomainErrorCode;
  readonly details?: ValidationDetail[];

  constructor(code: DomainErrorCode, message: string, details?: ValidationDetail[]) {
    super(message, ERROR_STATUS[code]);
    this.code = code;
    // details só faz sentido em VALIDATION_ERROR; nos outros códigos é ignorado.
    this.details = code === 'VALIDATION_ERROR' ? (details ?? []) : undefined;
  }
}

export function validationError(details: ValidationDetail[], message = 'Dados inválidos') {
  return new DomainException('VALIDATION_ERROR', message, details);
}
