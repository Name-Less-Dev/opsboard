import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { WorkOrderPriority } from '../../generated/prisma/enums';
import { DESCRIPTION_MAX, TITLE_MAX, TITLE_MIN } from '../work-order-limits';
import { IsDateTimeWithZone, IsNotInPast, Trim } from './validators';

export class CreateWorkOrderDto {
  @ApiProperty({
    minLength: TITLE_MIN,
    maxLength: TITLE_MAX,
    example: 'Trocar filtro do ar-condicionado',
  })
  @Trim()
  @IsString()
  @Length(TITLE_MIN, TITLE_MAX)
  title!: string;

  @ApiPropertyOptional({ type: String, maxLength: DESCRIPTION_MAX, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string | null;

  @ApiProperty({ enum: WorkOrderPriority, enumName: 'WorkOrderPriority' })
  @IsEnum(WorkOrderPriority)
  priority!: WorkOrderPriority;

  @ApiProperty({
    example: '2026-12-01T18:00:00-03:00',
    format: 'date-time',
    description: 'Data e hora com fuso; não pode estar no passado',
  })
  @IsDateTimeWithZone()
  @IsNotInPast()
  dueDate!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Operador: omita, envie null ou o próprio id. Supervisor: qualquer usuário ou null.',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}
