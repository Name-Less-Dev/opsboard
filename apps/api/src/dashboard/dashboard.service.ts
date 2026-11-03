import { Injectable } from '@nestjs/common';
import { Clock } from '../clock/clock';
import { Prisma } from '../generated/prisma/client';
import { WorkOrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { WORK_ORDER_SELECT, type WorkOrderResponse } from '../work-orders/work-order-select';
import { overdueWhere } from '../work-orders/work-order-query';

export const OVERDUE_ITEMS_LIMIT = 10;

export type DashboardSummary = {
  byStatus: Record<WorkOrderStatus, number>;
  overdue: { count: number; items: WorkOrderResponse[] };
  generatedAt: Date;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    // Um único "agora" para as três consultas, devolvido em generatedAt.
    const now = this.clock.now();
    // Mesma regra de atrasada da lista (?overdue=true), então os números sempre batem.
    const overdue = overdueWhere(now);

    // Transação interativa (e não a forma em array) porque, dentro do array, o Prisma perde o tipo
    // do groupBy. RepeatableRead dá a mesma foto do banco para as três consultas, como na lista.
    const [groups, overdueCount, overdueItems] = await this.prisma.$transaction(
      async (tx) =>
        Promise.all([
          // Uma consulta para todos os status, e não uma por status.
          tx.workOrder.groupBy({ by: ['status'], _count: { _all: true } }),
          tx.workOrder.count({ where: overdue }),
          tx.workOrder.findMany({
            where: overdue,
            select: WORK_ORDER_SELECT,
            // Prazo mais antigo primeiro; o id desempata prazos iguais.
            orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
            take: OVERDUE_ITEMS_LIMIT,
          }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    // O groupBy só devolve status que existem; começar com zeros garante todas as chaves.
    const byStatus = Object.fromEntries(
      Object.values(WorkOrderStatus).map((status) => [status, 0]),
    ) as Record<WorkOrderStatus, number>;
    for (const group of groups) {
      byStatus[group.status] = group._count._all;
    }

    return {
      byStatus,
      overdue: { count: overdueCount, items: overdueItems },
      generatedAt: now,
    };
  }
}
