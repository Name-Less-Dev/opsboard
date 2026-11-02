import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { WorkOrderPriority } from '../../generated/prisma/enums';
import { IsDateTimeWithZone, Trim } from './validators';

// @IsOptional também pula a validação de `null`. Nestes campos, ausente pode, mas nulo não.
const IfPresent = () => ValidateIf((_object, value) => value !== undefined);

// Sem status nem responsável: o forbidNonWhitelisted devolve 400 se vierem aqui.
export class UpdateWorkOrderDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 120 })
  @Trim()
  @IfPresent()
  @IsString()
  @Length(3, 120)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 2000,
    nullable: true,
    description: 'null limpa a descrição',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    enum: WorkOrderPriority,
    enumName: 'WorkOrderPriority',
    description: 'Somente supervisor',
  })
  @IfPresent()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  // Diferente da criação, o prazo pode estar no passado (ver Regras de negócio).
  @ApiPropertyOptional({
    example: '2026-12-01T18:00:00-03:00',
    format: 'date-time',
    description: 'Somente supervisor; data e hora com fuso',
  })
  @IfPresent()
  @IsDateTimeWithZone()
  dueDate?: string;
}
