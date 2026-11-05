import { Injectable } from '@nestjs/common';
import { Clock } from '../clock/clock';
import { AppConfig } from '../config/app-config';
import {
  DomainException,
  ImportInvalidException,
  validationError,
} from '../common/errors/domain.exception';
import { Prisma, type WorkOrder } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { buildExportCsv, exportFilename } from './csv/export-csv';
import { parseImportFile } from './csv/import-file';
import {
  buildReport,
  type ImportedOrder,
  type ImportReport,
  normalizeEmail,
  type RowError,
  validateRow,
} from './csv/import-row';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ExportWorkOrdersDto } from './dto/export-work-orders.dto';
import { ListWorkOrdersDto } from './dto/list-work-orders.dto';
import { UpdateAssigneeDto } from './dto/update-assignee.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import {
  type Actor,
  canAssign,
  canCreate,
  canEditFields,
  canTransition,
  type EditableField,
} from './work-order.policy';
import { WORK_ORDER_SELECT, type WorkOrderResponse } from './work-order-select';
import { buildWorkOrderOrderBy, buildWorkOrderWhere, countPages } from './work-order-query';

export type { WorkOrderResponse } from './work-order-select';

export type WorkOrderPage = {
  items: WorkOrderResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CsvExport = { filename: string; content: string };

export type ImportResult = ({ dryRun: true } & ImportReport) | { dryRun: false; imported: number };

/** Dados de uma ordem nova, já validados e com o responsável resolvido. */
export type NewWorkOrder = ImportedOrder;

// 500 linhas viram 1.000 INSERTs numa transação só; o padrão do Prisma (5 s) é curto para isso
// num banco mais lento. O teto evita uma transação presa segurando a conexão.
const IMPORT_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * A gravação da criação (Dia 3): a ordem e o evento CREATED, no cliente de transação recebido.
 * A criação pela API e a importação CSV passam por aqui; `source` só existe na importação.
 */
async function insertWorkOrder(
  tx: Prisma.TransactionClient,
  actorId: string,
  data: NewWorkOrder,
  source?: 'csv_import',
): Promise<WorkOrderResponse> {
  const created = await tx.workOrder.create({
    data: { ...data, createdById: actorId },
    select: WORK_ORDER_SELECT,
  });
  await tx.workOrderEvent.create({
    data: {
      workOrderId: created.id,
      actorId,
      type: 'CREATED',
      toStatus: created.status,
      payload: {
        ...data,
        dueDate: data.dueDate.toISOString(),
        ...(source ? { source } : {}),
      },
    },
  });
  return created;
}

type Denied = { allowed: false; reason: 'INVALID_TRANSITION' | 'ORDER_FINAL' | 'FORBIDDEN' };

// Traduz a decisão da política no código de erro: fluxo inválido é 409, falta de permissão é 403.
function assertAllowed(decision: { allowed: true } | Denied): void {
  if (decision.allowed) return;
  switch (decision.reason) {
    case 'FORBIDDEN':
      throw new DomainException('FORBIDDEN', 'Sem permissão para esta ação');
    case 'INVALID_TRANSITION':
      throw new DomainException('INVALID_TRANSITION', 'Transição de status inválida');
    case 'ORDER_FINAL':
      throw new DomainException('ORDER_FINALIZED', 'Ordem em estado final não pode ser alterada');
  }
}

const EDITABLE_FIELDS: readonly EditableField[] = ['title', 'description', 'priority', 'dueDate'];

// Controle de corrida: a condição inclui o status lido antes. Se outra requisição mudou o status
// nesse intervalo, nenhuma linha é afetada e o erro desfaz a transação inteira (409).
async function updateIfStatusUnchanged(
  tx: Prisma.TransactionClient,
  order: Pick<WorkOrder, 'id' | 'status'>,
  data: Prisma.WorkOrderUpdateManyMutationInput | Prisma.WorkOrderUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.workOrder.updateMany({
    where: { id: order.id, status: order.status },
    data,
  });
  if (count === 0) {
    throw new DomainException(
      'CONCURRENT_UPDATE',
      'A ordem foi alterada por outra requisição; tente novamente',
    );
  }
}

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async create(actor: Actor, dto: CreateWorkOrderDto): Promise<WorkOrderResponse> {
    assertAllowed(canCreate(actor, dto.assigneeId));

    const assigneeId = actor.role === 'OPERATOR' ? actor.id : (dto.assigneeId ?? null);
    if (assigneeId !== null && assigneeId !== actor.id) {
      await this.assertUserExists(assigneeId);
    }
    const data: NewWorkOrder = {
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      dueDate: new Date(dto.dueDate),
      assigneeId,
    };

    return this.prisma.$transaction((tx) => insertWorkOrder(tx, actor.id, data));
  }

  /**
   * Importação CSV, tudo ou nada. Erro no arquivo → 400; erro em alguma linha → relatório (dryRun)
   * ou 422 sem gravar nada. Os e-mails dos responsáveis são resolvidos numa consulta só.
   */
  async importCsv(
    actor: Actor,
    file: Uint8Array | undefined,
    dryRun: boolean,
  ): Promise<ImportResult> {
    if (!file) {
      throw new DomainException(
        'IMPORT_FILE_INVALID',
        'Envie um arquivo CSV no campo "file" (multipart/form-data).',
      );
    }
    const parsed = parseImportFile(file, this.config.importMaxRows);
    if (!parsed.ok) {
      throw new DomainException('IMPORT_FILE_INVALID', parsed.message);
    }
    const records = parsed.value;

    const emails = records
      .map((record) => normalizeEmail(record.values.assigneeEmail))
      .filter((email) => email !== null);
    const usersByEmail = await this.users.findIdsByEmails(emails);
    const context = { now: this.clock.now(), timezone: this.config.appTimezone, usersByEmail };

    const orders: NewWorkOrder[] = [];
    const errors: RowError[] = [];
    for (const record of records) {
      const result = validateRow(record, context);
      if (result.ok) orders.push(result.value);
      else errors.push(...result.errors);
    }
    const report = buildReport(records.length, errors);

    if (dryRun) return { dryRun: true, ...report };
    if (!report.valid) throw new ImportInvalidException(report.errors, report.totalErrors);

    // Sequencial de propósito: a transação interativa usa uma conexão só, e a ordem de criação
    // segue a do arquivo. Qualquer falha desfaz todas as ordens e todos os eventos.
    await this.prisma.$transaction(
      async (tx) => {
        for (const order of orders) {
          await insertWorkOrder(tx, actor.id, order, 'csv_import');
        }
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
    return { dryRun: false, imported: orders.length };
  }

  async findPage(actor: Actor, query: ListWorkOrdersDto): Promise<WorkOrderPage> {
    const { page, pageSize } = query;
    const where = this.listWhere(actor, query, this.clock.now());

    // Mesmo `where` nas duas consultas. RepeatableRead faz as duas lerem a mesma foto do banco:
    // no padrão (ReadCommitted), uma ordem criada entre elas faria `total` e `items` divergirem.
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.workOrder.findMany({
          where,
          select: WORK_ORDER_SELECT,
          orderBy: buildWorkOrderOrderBy(query.sortBy, query.order),
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.workOrder.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page, pageSize, totalPages: countPages(total, pageSize) };
  }

  /**
   * Mesmo `where` e `orderBy` da lista, sem paginação. Busca uma linha além do teto: se ela vier,
   * o resultado passou do limite. Uma consulta só, sem `count` separado nem transação.
   */
  async exportCsv(actor: Actor, query: ExportWorkOrdersDto): Promise<CsvExport> {
    const now = this.clock.now();
    const max = this.config.exportMaxRows;
    const orders = await this.prisma.workOrder.findMany({
      where: this.listWhere(actor, query, now),
      select: WORK_ORDER_SELECT,
      orderBy: buildWorkOrderOrderBy(query.sortBy, query.order),
      take: max + 1,
    });
    if (orders.length > max) {
      throw new DomainException(
        'EXPORT_TOO_LARGE',
        `A exportação passa de ${max} linhas. Use mais filtros para reduzir o resultado.`,
      );
    }
    return {
      filename: exportFilename(now, this.config.appTimezone),
      content: buildExportCsv(orders),
    };
  }

  async findOne(id: string): Promise<WorkOrderResponse> {
    const order = await this.prisma.workOrder.findUnique({
      where: { id },
      select: WORK_ORDER_SELECT,
    });
    if (!order) {
      throw new DomainException('NOT_FOUND', 'Ordem de serviço não encontrada');
    }
    return order;
  }

  async update(actor: Actor, id: string, dto: UpdateWorkOrderDto): Promise<WorkOrderResponse> {
    const fields = EDITABLE_FIELDS.filter((field) => dto[field] !== undefined);
    if (fields.length === 0) {
      throw validationError([], 'Informe ao menos um campo para editar');
    }

    const order = await this.findOrderOrThrow(id);
    assertAllowed(canEditFields(actor, order, fields));

    const data: Prisma.WorkOrderUpdateManyMutationInput = {};
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    if (dto.title !== undefined && dto.title !== order.title) {
      data.title = dto.title;
      changes.title = { from: order.title, to: dto.title };
    }
    if (dto.description !== undefined && dto.description !== order.description) {
      data.description = dto.description;
      changes.description = { from: order.description, to: dto.description };
    }
    if (dto.priority !== undefined && dto.priority !== order.priority) {
      data.priority = dto.priority;
      changes.priority = { from: order.priority, to: dto.priority };
    }
    if (dto.dueDate !== undefined) {
      const dueDate = new Date(dto.dueDate);
      if (dueDate.getTime() !== order.dueDate.getTime()) {
        data.dueDate = dueDate;
        changes.dueDate = { from: order.dueDate.toISOString(), to: dueDate.toISOString() };
      }
    }
    if (Object.keys(changes).length === 0) {
      return this.findOne(id);
    }

    return this.prisma.$transaction(async (tx) => {
      await updateIfStatusUnchanged(tx, order, data);
      await tx.workOrderEvent.create({
        data: { workOrderId: id, actorId: actor.id, type: 'UPDATED', payload: changes },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, select: WORK_ORDER_SELECT });
    });
  }

  async changeStatus(
    actor: Actor,
    id: string,
    { status: to }: UpdateStatusDto,
  ): Promise<WorkOrderResponse> {
    const order = await this.findOrderOrThrow(id);
    assertAllowed(canTransition(actor, order, to));

    return this.prisma.$transaction(async (tx) => {
      await updateIfStatusUnchanged(tx, order, { status: to });
      await tx.workOrderEvent.create({
        data: {
          workOrderId: id,
          actorId: actor.id,
          type: 'STATUS_CHANGED',
          fromStatus: order.status,
          toStatus: to,
          payload: {},
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, select: WORK_ORDER_SELECT });
    });
  }

  async assign(
    actor: Actor,
    id: string,
    { assigneeId }: UpdateAssigneeDto,
  ): Promise<WorkOrderResponse> {
    const order = await this.findOrderOrThrow(id);
    assertAllowed(canAssign(actor, order));

    if (assigneeId === order.assigneeId) {
      return this.findOne(id);
    }
    if (assigneeId !== null) {
      await this.assertUserExists(assigneeId);
    }

    return this.prisma.$transaction(async (tx) => {
      await updateIfStatusUnchanged(tx, order, { assigneeId });
      await tx.workOrderEvent.create({
        data: {
          workOrderId: id,
          actorId: actor.id,
          type: 'ASSIGNED',
          payload: { from: order.assigneeId, to: assigneeId },
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, select: WORK_ORDER_SELECT });
    });
  }

  async remove(id: string): Promise<void> {
    // Os eventos saem junto pelo onDelete: Cascade da chave estrangeira.
    const { count } = await this.prisma.workOrder.deleteMany({ where: { id } });
    if (count === 0) {
      throw new DomainException('NOT_FOUND', 'Ordem de serviço não encontrada');
    }
  }

  private listWhere(actor: Actor, query: ExportWorkOrdersDto, now: Date) {
    return buildWorkOrderWhere(
      {
        status: query.status,
        priority: query.priority,
        assigneeId: query.assigneeId,
        overdue: query.overdue,
        dueFrom: query.dueFrom ? new Date(query.dueFrom) : undefined,
        dueTo: query.dueTo ? new Date(query.dueTo) : undefined,
        q: query.q,
      },
      { actorId: actor.id, now },
    );
  }

  private async findOrderOrThrow(id: string): Promise<WorkOrder> {
    const order = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!order) {
      throw new DomainException('NOT_FOUND', 'Ordem de serviço não encontrada');
    }
    return order;
  }

  private async assertUserExists(userId: string): Promise<void> {
    if (!(await this.users.findById(userId))) {
      throw validationError(
        [{ field: 'assigneeId', messages: ['Responsável não encontrado'] }],
        'Responsável não encontrado',
      );
    }
  }
}
