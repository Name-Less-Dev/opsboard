import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorResponse,
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
    type: [ValidationDetailDto],
    description: 'Só em VALIDATION_ERROR, e sempre presente nele (pode ser vazio)',
  })
  details?: ValidationDetailDto[];

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
