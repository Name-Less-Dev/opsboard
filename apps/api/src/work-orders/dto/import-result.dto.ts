import { ApiProperty } from '@nestjs/swagger';
import { ImportErrorDetailDto } from '../../common/errors/error-response.dto';
import type { ImportReport } from '../csv/import-row';

// Classes só para a documentação; `implements` amarra o schema ao tipo que o service devolve.

export class ImportReportResponseDto implements ImportReport {
  @ApiProperty({ type: Boolean, enum: [true], description: 'Sempre true: nada foi gravado' })
  dryRun!: true;

  @ApiProperty({ example: false, description: 'true se nenhuma linha tem erro' })
  valid!: boolean;

  @ApiProperty({
    example: 120,
    description: 'Linhas de dados lidas, sem contar o cabeçalho nem as linhas vazias',
  })
  totalRows!: number;

  @ApiProperty({ example: 118 })
  validRows!: number;

  @ApiProperty({ example: 2, description: 'Total real de erros, mesmo acima de 100' })
  totalErrors!: number;

  @ApiProperty({
    type: [ImportErrorDetailDto],
    description: 'No máximo 100, em ordem de linha e coluna',
  })
  errors!: ImportErrorDetailDto[];
}

export class ImportDoneResponseDto {
  @ApiProperty({ type: Boolean, enum: [false] })
  dryRun!: false;

  @ApiProperty({ example: 12, description: 'Ordens criadas' })
  imported!: number;
}

const ROW_ERRORS_EXAMPLE = [
  {
    row: 3,
    column: 'title',
    code: 'TOO_SHORT',
    message: 'O título precisa ter pelo menos 3 caracteres.',
  },
  {
    row: 7,
    column: 'priority',
    code: 'INVALID_ENUM',
    message: 'Prioridade inválida: use Baixa, Média, Alta ou Urgente.',
  },
];

export const IMPORT_REPORT_EXAMPLE = {
  dryRun: true,
  valid: false,
  totalRows: 120,
  validRows: 118,
  totalErrors: 2,
  errors: ROW_ERRORS_EXAMPLE,
};

export const IMPORT_INVALID_EXAMPLE = {
  statusCode: 422,
  code: 'IMPORT_INVALID',
  message: 'O arquivo tem 2 erros; nenhuma ordem foi importada',
  details: ROW_ERRORS_EXAMPLE,
  totalErrors: 2,
  path: '/work-orders/import',
  timestamp: '2026-11-05T12:00:00.000Z',
  requestId: '0b6d2a4e-3f1c-4d9a-8e7b-5c2f1a0d9e8b',
};

export const IMPORT_FILE_INVALID_EXAMPLE = {
  statusCode: 400,
  code: 'IMPORT_FILE_INVALID',
  message: 'Faltam colunas obrigatórias no cabeçalho: priority.',
  path: '/work-orders/import',
  timestamp: '2026-11-05T12:00:00.000Z',
  requestId: '0b6d2a4e-3f1c-4d9a-8e7b-5c2f1a0d9e8b',
};
