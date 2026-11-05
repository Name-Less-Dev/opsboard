import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

// Descrição padrão por status, com os `code` possíveis. A rota pode trocar a descrição.
const DESCRIPTIONS = {
  400: 'VALIDATION_ERROR: payload, query ou parâmetro inválido (ver `details`)',
  401: 'UNAUTHORIZED: token ausente, inválido ou expirado',
  403: 'FORBIDDEN: ação válida no fluxo, mas sem permissão para este usuário',
  404: 'NOT_FOUND: ordem de serviço não encontrada',
  409: 'INVALID_TRANSITION, ORDER_FINALIZED ou CONCURRENT_UPDATE',
  413: 'PAYLOAD_TOO_LARGE: corpo ou arquivo acima do limite',
  422: 'EXPORT_TOO_LARGE: resultado acima de EXPORT_MAX_ROWS linhas; use mais filtros',
  429: 'TOO_MANY_REQUESTS: tentativas demais deste IP; ver o header Retry-After',
  503: 'SERVICE_UNAVAILABLE: banco de dados indisponível',
} as const;

type Status = keyof typeof DESCRIPTIONS;

const errorResponse = (status: number, description: string, example?: object) =>
  ApiResponse({ status, description, type: ErrorResponseDto, ...(example ? { example } : {}) });

// Documenta só os status que a rota pode devolver, todos com o mesmo schema de erro.
// O 500 entra sempre: qualquer rota pode falhar de forma inesperada.
export const ApiErrors = (...items: (Status | [Status, string] | [Status, string, object])[]) =>
  applyDecorators(
    ...items.map((item) =>
      Array.isArray(item)
        ? errorResponse(item[0], item[1], item[2])
        : errorResponse(item, DESCRIPTIONS[item]),
    ),
    errorResponse(500, 'INTERNAL_ERROR: erro inesperado; o detalhe fica no log com o requestId'),
  );
