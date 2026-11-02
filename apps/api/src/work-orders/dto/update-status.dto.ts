import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkOrderStatus } from '../../generated/prisma/enums';

export class UpdateStatusDto {
  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;
}
