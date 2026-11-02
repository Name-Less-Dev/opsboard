import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderPriority, WorkOrderStatus } from '../../generated/prisma/enums';
import type { WorkOrderPage, WorkOrderResponse } from '../work-orders.service';

// Classes só para a documentação: o `implements` faz o compilador acusar se divergirem do service.
class UserRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Operadora' })
  name!: string;
}

export class WorkOrderResponseDto implements WorkOrderResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: WorkOrderPriority, enumName: 'WorkOrderPriority' })
  priority!: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  status!: WorkOrderStatus;

  @ApiProperty()
  dueDate!: Date;

  @ApiProperty({ type: UserRefDto, nullable: true })
  assignee!: UserRefDto | null;

  @ApiProperty({ type: UserRefDto })
  createdBy!: UserRefDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class WorkOrderPageResponseDto implements WorkOrderPage {
  @ApiProperty({ type: [WorkOrderResponseDto] })
  items!: WorkOrderResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
