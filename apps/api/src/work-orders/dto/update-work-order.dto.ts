import { IsEnum, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { WorkOrderPriority } from '../../generated/prisma/enums';
import { IsDateTimeWithZone, Trim } from './validators';

// @IsOptional também pula a validação de `null`. Nestes campos, ausente pode, mas nulo não.
const IfPresent = () => ValidateIf((_object, value) => value !== undefined);

// Sem status nem responsável: o forbidNonWhitelisted devolve 400 se vierem aqui.
export class UpdateWorkOrderDto {
  @Trim()
  @IfPresent()
  @IsString()
  @Length(3, 120)
  title?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IfPresent()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  // Diferente da criação, o prazo pode estar no passado (ver Regras de negócio).
  @IfPresent()
  @IsDateTimeWithZone()
  dueDate?: string;
}
