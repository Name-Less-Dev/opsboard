import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { WorkOrderPriority, WorkOrderStatus } from '../../generated/prisma/enums';
import { ME, parseList, SORT_FIELDS, type SortField, type SortOrder } from '../work-order-query';
import { IsDateTimeWithZone, IsNotBefore, Trim } from './validators';

const AsList = () => Transform(({ value }: { value: unknown }) => parseList(value));

// Query string chega como texto: só "true" e "false" viram booleano; o resto cai no @IsBoolean (400).
export const AsBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

const DUE_EXAMPLE = '2026-11-30T23:59:59-03:00';

export class ListWorkOrdersDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  // Query string sempre chega como texto; @Type converte antes de validar.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({
    enum: WorkOrderStatus,
    enumName: 'WorkOrderStatus',
    isArray: true,
    description: 'Um ou mais (OR), separados por vírgula ou repetindo o parâmetro',
    example: ['OPEN', 'IN_PROGRESS'],
  })
  @IsOptional()
  @AsList()
  @IsEnum(WorkOrderStatus, { each: true })
  status?: WorkOrderStatus[];

  @ApiPropertyOptional({
    enum: WorkOrderPriority,
    enumName: 'WorkOrderPriority',
    isArray: true,
    description: 'Um ou mais (OR), separados por vírgula ou repetindo o parâmetro',
    example: ['HIGH', 'URGENT'],
  })
  @IsOptional()
  @AsList()
  @IsEnum(WorkOrderPriority, { each: true })
  priority?: WorkOrderPriority[];

  @ApiPropertyOptional({
    description: 'UUID de um usuário ou `me` (o usuário autenticado)',
    example: ME,
  })
  @IsOptional()
  // Os dois ValidateIf precisam valer: presente e diferente de "me" → precisa ser UUID.
  @ValidateIf((_object, value) => value !== ME)
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: '`true` filtra só atrasadas; `false` ou ausente não filtra',
  })
  @IsOptional()
  @AsBoolean()
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-11-01T00:00:00-03:00',
    description: 'Prazo a partir deste instante (inclusivo); exige hora e fuso',
  })
  @IsOptional()
  @IsDateTimeWithZone()
  dueFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: DUE_EXAMPLE,
    description: 'Prazo até este instante (inclusivo); não pode ser anterior a `dueFrom`',
  })
  @IsOptional()
  @IsDateTimeWithZone()
  @IsNotBefore('dueFrom')
  dueTo?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    example: 'filtro',
    description: 'Trecho do título ou da descrição, sem diferenciar maiúsculas',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy: SortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: SortOrder = 'desc';
}
