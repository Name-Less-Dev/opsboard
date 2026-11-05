import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
import { CSV_CONTENT_TYPE } from './csv/export-csv';
import { IMPORT_MAX_BYTES, UploadErrorsInterceptor } from './csv/upload-errors.interceptor';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ExportWorkOrdersDto } from './dto/export-work-orders.dto';
import { ImportWorkOrdersQueryDto } from './dto/import-work-orders.dto';
import { ListWorkOrdersDto } from './dto/list-work-orders.dto';
import { WorkOrderPageResponseDto, WorkOrderResponseDto } from './dto/work-order-response.dto';
import { UpdateAssigneeDto } from './dto/update-assignee.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  type ImportResult,
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

  // Declarada antes de `:id`: senão "export" seria lido como id (e daria 400 de UUID).
  @Get('export')
  @ApiOperation({
    summary: 'Exporta as ordens filtradas em CSV',
    description:
      'Mesmos filtros e ordenação de GET /work-orders, sem page e pageSize. UTF-8 com BOM, separador `;`, CRLF. Acima de EXPORT_MAX_ROWS linhas, 422 EXPORT_TOO_LARGE.',
  })
  @ApiOkResponse({
    description: 'Arquivo CSV (Content-Disposition: attachment)',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  @ApiErrors(400, 422)
  async exportCsv(
    @CurrentUser() actor: PublicUser,
    @Query() query: ExportWorkOrdersDto,
  ): Promise<StreamableFile> {
    const { filename, content } = await this.workOrders.exportCsv(actor, query);
    return new StreamableFile(Buffer.from(content, 'utf8'), {
      type: CSV_CONTENT_TYPE,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  // Guards rodam antes dos interceptors: operador recebe 403 sem o arquivo ser lido.
  // Sem `storage` nem `dest`, o Multer guarda o arquivo só em memória (`file.buffer`), nunca em disco.
  @Post('import')
  @Roles(Role.SUPERVISOR)
  @UseInterceptors(
    UploadErrorsInterceptor,
    FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }),
  )
  @ApiOperation({
    summary: 'Importa ordens de um CSV (somente supervisor)',
    description:
      'Tudo ou nada. dryRun=true só valida (200 com o relatório); dryRun=false grava (201) ou devolve 422 IMPORT_INVALID sem gravar nada.',
  })
  @ApiErrors(400, 403, 413, 422)
  async importCsv(
    @CurrentUser() actor: PublicUser,
    @Query() query: ImportWorkOrdersQueryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportResult> {
    const result = await this.workOrders.importCsv(actor, file?.buffer, query.dryRun);
    // Validar não cria nada (200); importar cria as ordens (201).
    res.status(result.dryRun ? 200 : 201);
    return result;
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
