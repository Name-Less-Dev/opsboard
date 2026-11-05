import { Injectable } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import { Prisma } from '../generated/prisma/client';
import type { WorkOrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { countPages } from '../work-orders/work-order-query';
import {
  type AssignedDetails,
  assignedUserIds,
  mapEventDetails,
  type UpdatedDetails,
} from './event-details.mapper';
import type { ListEventsDto } from './dto/list-events.dto';

// Lista de permissão: do ator saem só id e nome; o `payload` bruto é lido aqui, mas nunca sai.
const EVENT_SELECT = {
  id: true,
  type: true,
  fromStatus: true,
  toStatus: true,
  payload: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.WorkOrderEventSelect;

type EventRow = Prisma.WorkOrderEventGetPayload<{ select: typeof EVENT_SELECT }>;

type EventBase = {
  id: string;
  actor: { id: string; name: string };
  fromStatus: WorkOrderStatus | null;
  toStatus: WorkOrderStatus | null;
  createdAt: Date;
};

/** Um evento público: `details` tipado pelo `type` (união discriminada). */
export type WorkOrderEventResponse =
  | (EventBase & { type: 'CREATED'; details: null })
  | (EventBase & { type: 'STATUS_CHANGED'; details: null })
  | (EventBase & { type: 'UPDATED'; details: UpdatedDetails | null })
  | (EventBase & { type: 'ASSIGNED'; details: AssignedDetails | null });

export type WorkOrderEventPage = {
  items: WorkOrderEventResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function toResponse(row: EventRow, names: ReadonlyMap<string, string>): WorkOrderEventResponse {
  const base: EventBase = {
    id: row.id,
    actor: row.actor,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    createdAt: row.createdAt,
  };
  // O mapeador devolve o formato certo para cada tipo; os casts só estreitam a união dele.
  const details = mapEventDetails(row.type, row.payload, names);
  switch (row.type) {
    case 'CREATED':
    case 'STATUS_CHANGED':
      return { ...base, type: row.type, details: null };
    case 'UPDATED':
      return { ...base, type: row.type, details: details as UpdatedDetails | null };
    case 'ASSIGNED':
      return { ...base, type: row.type, details: details as AssignedDetails | null };
  }
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    workOrderId: string,
    { page, pageSize }: ListEventsDto,
  ): Promise<WorkOrderEventPage> {
    // As três leituras na mesma foto do banco (como na lista): um evento gravado entre a
    // contagem e a página não faz `total` divergir de `items`.
    const [order, rows, total] = await this.prisma.$transaction(
      [
        this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true } }),
        this.prisma.workOrderEvent.findMany({
          where: { workOrderId },
          select: EVENT_SELECT,
          // Mais recente primeiro; empate no mesmo instante desfeito pelo id, no mesmo sentido.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.workOrderEvent.count({ where: { workOrderId } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!order) {
      throw new DomainException('NOT_FOUND', 'Ordem de serviço não encontrada');
    }

    // Nomes dos responsáveis citados nas atribuições: uma consulta para a página inteira.
    const ids = assignedUserIds(rows);
    const users =
      ids.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          });
    const names = new Map(users.map((user) => [user.id, user.name]));

    return {
      items: rows.map((row) => toResponse(row, names)),
      total,
      page,
      pageSize,
      totalPages: countPages(total, pageSize),
    };
  }
}
