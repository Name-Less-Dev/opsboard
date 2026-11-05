import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { DomainException } from '../../common/errors/domain.exception';

export const IMPORT_MAX_BYTES = 1024 * 1024;

/**
 * Fica antes do `FileInterceptor` e traduz os erros do Multer para os códigos da importação:
 * arquivo acima do limite → 413 PAYLOAD_TOO_LARGE; campo errado, arquivo a mais ou multipart
 * quebrado → 400 IMPORT_FILE_INVALID. Os erros do nosso código são `DomainException`, que não
 * herda de `BadRequestException`, então passam intactos.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => translate(error))));
  }
}

function translate(error: unknown): unknown {
  if (error instanceof PayloadTooLargeException) {
    return new DomainException('PAYLOAD_TOO_LARGE', 'O arquivo passa de 1 MB.');
  }
  if (error instanceof BadRequestException) {
    return new DomainException(
      'IMPORT_FILE_INVALID',
      'Envie um único arquivo CSV no campo "file" (multipart/form-data).',
    );
  }
  return error;
}
