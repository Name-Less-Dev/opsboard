import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderPriority, WorkOrderStatus } from '../../generated/prisma/enums';
import type { WorkOrderPage, WorkOrderResponse } from '../work-orders.service';

// Classes só para a documentação: o `implements` faz o compilador acusar se divergirem do service.
class UserRefDto {
  @ApiProperty({ format: 'uuid', example: '9cbbf785-9a72-4703-b484-0afd39d65703' })
  id!: string;

  @ApiProperty({ example: 'Ana Operadora' })
  name!: string;
}

export class WorkOrderResponseDto implements WorkOrderResponse {
  @ApiProperty({ format: 'uuid', example: '3f6c1d2e-8a4b-4c7d-9e0f-1a2b3c4d5e6f' })
  id!: string;

  @ApiProperty({ example: 'Vazamento na pia da copa' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Água acumulando embaixo do gabinete.' })
  description!: string | null;

  @ApiProperty({ enum: WorkOrderPriority, enumName: 'WorkOrderPriority', example: 'HIGH' })
  priority!: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus', example: 'IN_PROGRESS' })
  status!: WorkOrderStatus;

  @ApiProperty({ example: '2026-11-01T17:00:00.000Z' })
  dueDate!: Date;

  @ApiProperty({ type: UserRefDto, nullable: true })
  assignee!: UserRefDto | null;

  @ApiProperty({ type: UserRefDto })
  createdBy!: UserRefDto;

  @ApiProperty({ example: '2026-10-19T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-20T09:15:00.000Z' })
  updatedAt!: Date;
}

export class WorkOrderPageResponseDto implements WorkOrderPage {
  @ApiProperty({ type: [WorkOrderResponseDto] })
  items!: WorkOrderResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 3, description: 'Arredondado para cima; 0 quando não há resultados' })
  totalPages!: number;
}
