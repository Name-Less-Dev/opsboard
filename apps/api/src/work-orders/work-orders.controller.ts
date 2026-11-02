import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/users.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersDto } from './dto/list-work-orders.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  type WorkOrderPage,
  type WorkOrderResponse,
  WorkOrdersService,
} from './work-orders.service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Post()
  create(
    @CurrentUser() actor: PublicUser,
    @Body() dto: CreateWorkOrderDto,
  ): Promise<WorkOrderResponse> {
    return this.workOrders.create(actor, dto);
  }

  @Get()
  findPage(@Query() query: ListWorkOrdersDto): Promise<WorkOrderPage> {
    return this.workOrders.findPage(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<WorkOrderResponse> {
    return this.workOrders.findOne(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
  ): Promise<WorkOrderResponse> {
    return this.workOrders.update(actor, id, dto);
  }
}
