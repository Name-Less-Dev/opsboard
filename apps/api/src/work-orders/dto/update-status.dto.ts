import { IsEnum } from 'class-validator';
import { WorkOrderStatus } from '../../generated/prisma/enums';

export class UpdateStatusDto {
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;
}
