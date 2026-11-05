import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrors } from '../common/errors/api-errors.decorator';
import { parseIdPipe } from '../common/pipes/parse-id.pipe';
import { ListEventsDto } from './dto/list-events.dto';
import {
  EVENT_MODELS,
  EVENT_PAGE_EXAMPLE,
  WorkOrderEventPageDto,
} from './dto/work-order-event.dto';
import { EventsService, type WorkOrderEventPage } from './events.service';

// Só leitura: o histórico é append-only, então não há rota de edição nem de exclusão.
// Sem @Roles: qualquer autenticado lê o histórico de qualquer ordem.
@ApiTags('work-orders')
@ApiBearerAuth()
@ApiExtraModels(...EVENT_MODELS)
@Controller('work-orders')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get(':id/events')
  @ApiOperation({
    summary: 'Histórico de eventos da ordem, mais recente primeiro',
    description:
      'Paginado. `details` depende do `type`; e-mail, hash e o payload bruto nunca saem, e na edição da descrição sai só o nome do campo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkOrderEventPageDto, example: EVENT_PAGE_EXAMPLE })
  @ApiErrors(400, 401, 404)
  findPage(
    @Param('id', parseIdPipe()) id: string,
    @Query() query: ListEventsDto,
  ): Promise<WorkOrderEventPage> {
    return this.events.findPage(id, query);
  }
}
