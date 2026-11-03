import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { parseIdPipe } from '../common/pipes/parse-id.pipe';
import { Role } from '../generated/prisma/enums';
import type { PublicUser } from '../users/users.service';
import { ApiErrors } from '../common/errors/api-errors.decorator';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersDto } from './dto/list-work-orders.dto';
import { WorkOrderPageResponseDto, WorkOrderResponseDto } from './dto/work-order-response.dto';
import { UpdateAssigneeDto } from './dto/update-assignee.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  type WorkOrderPage,
  type WorkOrderResponse,
  WorkOrdersService,
} from './work-orders.service';

@ApiTags('work-orders')
@ApiBearerAuth()
@ApiErrors(401)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Cria uma ordem',
    description: 'Operador vira o responsável; enviar outro responsável retorna 403.',
  })
  @ApiCreatedResponse({ type: WorkOrderResponseDto })
  @ApiErrors(400, 403)
  create(
    @CurrentUser() actor: PublicUser,
    @Body() dto: CreateWorkOrderDto,
  ): Promise<WorkOrderResponse> {
    return this.workOrders.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista as ordens com filtros, busca, ordenação e paginação',
    description:
      'Filtros diferentes se combinam com AND; valores de um mesmo filtro, com OR. Empates na ordenação são desfeitos pelo id.',
  })
  @ApiOkResponse({ type: WorkOrderPageResponseDto })
  @ApiErrors(400)
  findPage(
    @CurrentUser() actor: PublicUser,
    @Query() query: ListWorkOrdersDto,
  ): Promise<WorkOrderPage> {
    return this.workOrders.findPage(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Mostra uma ordem' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiErrors(400, 404)
  findOne(@Param('id', parseIdPipe()) id: string): Promise<WorkOrderResponse> {
    return this.workOrders.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita título, descrição, prioridade e prazo',
    description:
      'Supervisor edita qualquer ordem ativa. Operador, só título e descrição das ordens em que é o responsável.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiErrors(400, 403, 404, 409)
  update(
    @CurrentUser() actor: PublicUser,
    @Param('id', parseIdPipe()) id: string,
    @Body() dto: UpdateWorkOrderDto,
  ): Promise<WorkOrderResponse> {
    return this.workOrders.update(actor, id, dto);
  }

  // Sem @Roles: responsável e supervisor usam o mesmo endpoint, e quem decide é a política.
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Muda o status da ordem',
    description:
      'OPEN → IN_PROGRESS e IN_PROGRESS → DONE: responsável ou supervisor. OPEN/IN_PROGRESS → CANCELLED: só supervisor.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiErrors(400, 403, 404, 409)
  changeStatus(
    @CurrentUser() actor: PublicUser,
    @Param('id', parseIdPipe()) id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<WorkOrderResponse> {
    return this.workOrders.changeStatus(actor, id, dto);
  }

  @Patch(':id/assignee')
  @ApiOperation({ summary: 'Define ou remove o responsável (somente supervisor)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiErrors(400, 403, 404, 409)
  @Roles(Role.SUPERVISOR)
  assign(
    @CurrentUser() actor: PublicUser,
    @Param('id', parseIdPipe()) id: string,
    @Body() dto: UpdateAssigneeDto,
  ): Promise<WorkOrderResponse> {
    return this.workOrders.assign(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui a ordem e seus eventos (somente supervisor)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Ordem excluída' })
  @ApiErrors(400, 403, 404)
  @Roles(Role.SUPERVISOR)
  @HttpCode(204)
  remove(@Param('id', parseIdPipe()) id: string): Promise<void> {
    return this.workOrders.remove(id);
  }
}
