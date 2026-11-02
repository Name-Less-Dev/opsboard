import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { WorkOrderPriority } from '../../generated/prisma/enums';
import { IsDateTimeWithZone, IsNotInPast, Trim } from './validators';

export class CreateWorkOrderDto {
  @Trim()
  @IsString()
  @Length(3, 120)
  title!: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsEnum(WorkOrderPriority)
  priority!: WorkOrderPriority;

  @IsDateTimeWithZone()
  @IsNotInPast()
  dueDate!: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}
