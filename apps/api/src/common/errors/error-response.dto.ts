import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { IMPORT_COLUMNS } from '../../work-orders/csv/import-file';
import { ROW_ERROR_CODES } from '../../work-orders/csv/import-row';
import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorResponse,
  type ImportErrorDetail,
  type ValidationDetail,
} from './error-code';

// Classes só para a documentação; `implements` amarra o schema ao tipo que o filtro devolve.
export class ValidationDetailDto implements ValidationDetail {
  @ApiProperty({
    example: 'title',
    description: 'Campo inválido; aninhados com ponto (items.0.name)',
  })
  field!: string;

  @ApiProperty({
    type: [String],
    example: ['title must be longer than or equal to 3 characters'],
  })
  messages!: string[];
}

export class ImportErrorDetailDto implements ImportErrorDetail {
  @ApiProperty({ example: 7, description: 'Linha no arquivo; o cabeçalho é a linha 1' })
  row!: number;

  @ApiProperty({
    type: String,
    enum: IMPORT_COLUMNS,
    enumName: 'ImportColumn',
    nullable: true,
    example: 'priority',
    description: 'Coluna com problema; null quando o erro é da linha inteira',
  })
  column!: (typeof IMPORT_COLUMNS)[number] | null;

  @ApiProperty({
    enum: ROW_ERROR_CODES,
    enumName: 'ImportRowErrorCode',
    example: 'INVALID_ENUM',
    description: 'Estável: o cliente decide por ele, não pela mensagem',
  })
  code!: (typeof ROW_ERROR_CODES)[number];

  @ApiProperty({ example: 'Prioridade inválida: use Baixa, Média, Alta ou Urgente.' })
  message!: string;
}

@ApiExtraModels(ValidationDetailDto, ImportErrorDetailDto)
export class ErrorResponseDto implements ErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    enum: ERROR_CODES,
    enumName: 'ErrorCode',
    example: 'VALIDATION_ERROR',
    description: 'Estável: é o que o cliente deve usar para decidir o que fazer',
  })
  code!: ErrorCode;

  @ApiProperty({ example: 'Dados inválidos', description: 'Legível, em português; pode mudar' })
  message!: string;

  @ApiPropertyOptional({
    oneOf: [
      { type: 'array', items: { $ref: getSchemaPath(ValidationDetailDto) } },
      { type: 'array', items: { $ref: getSchemaPath(ImportErrorDetailDto) } },
    ],
    description:
      'Só em VALIDATION_ERROR (por campo: `{ field, messages }`) e IMPORT_INVALID (por linha: `{ row, column, code, message }`, no máximo 100). Sempre presente nesses dois, mesmo vazio.',
  })
  details?: ValidationDetailDto[] | ImportErrorDetailDto[];

  @ApiPropertyOptional({
    example: 150,
    description: 'Só em IMPORT_INVALID: total real de erros (details traz no máximo 100)',
  })
  totalErrors?: number;

  @ApiProperty({ example: '/work-orders', description: 'Caminho, sem a query string' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-04T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({
    example: '0b6d2a4e-3f1c-4d9a-8e7b-5c2f1a0d9e8b',
    description: 'Igual ao header x-request-id; informe ao suporte em caso de erro 500',
  })
  requestId!: string;
}
