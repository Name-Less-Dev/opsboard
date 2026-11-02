import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersDto } from './dto/list-work-orders.dto';
import { type Actor, canCreate } from './work-order.policy';

// Lista de permissão do formato único de resposta: do usuário só saem id e nome.
const WORK_ORDER_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  dueDate: true,
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkOrderSelect;

export type WorkOrderResponse = Prisma.WorkOrderGetPayload<{ select: typeof WORK_ORDER_SELECT }>;

export type WorkOrderPage = {
  items: WorkOrderResponse[];
  total: number;
  page: number;
  pageSize: number;
};

type Denied = { allowed: false; reason: 'INVALID_TRANSITION' | 'ORDER_FINAL' | 'FORBIDDEN' };

// Traduz a decisão da política em HTTP: fluxo inválido é 409, falta de permissão é 403.
function assertAllowed(decision: { allowed: true } | Denied): void {
  if (decision.allowed) return;
  switch (decision.reason) {
    case 'FORBIDDEN':
      throw new ForbiddenException('Sem permissão para esta ação');
    case 'INVALID_TRANSITION':
      throw new ConflictException('Transição de status inválida');
    case 'ORDER_FINAL':
      throw new ConflictException('Ordem em estado final não pode ser alterada');
  }
}

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async create(actor: Actor, dto: CreateWorkOrderDto): Promise<WorkOrderResponse> {
    assertAllowed(canCreate(actor, dto.assigneeId));

    const assigneeId = actor.role === 'OPERATOR' ? actor.id : (dto.assigneeId ?? null);
    if (assigneeId !== null && assigneeId !== actor.id) {
      await this.assertUserExists(assigneeId);
    }
    const data = {
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      dueDate: new Date(dto.dueDate),
      assigneeId,
    };

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workOrder.create({
        data: { ...data, createdById: actor.id },
        select: WORK_ORDER_SELECT,
      });
      await tx.workOrderEvent.create({
        data: {
          workOrderId: created.id,
          actorId: actor.id,
          type: 'CREATED',
          toStatus: created.status,
          payload: { ...data, dueDate: data.dueDate.toISOString() },
        },
      });
      return created;
    });
  }

  async findPage({ page, pageSize }: ListWorkOrdersDto): Promise<WorkOrderPage> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        select: WORK_ORDER_SELECT,
        // O id desempata ordens criadas no mesmo instante, para a paginação não repetir nem pular.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workOrder.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string): Promise<WorkOrderResponse> {
    const order = await this.prisma.workOrder.findUnique({
      where: { id },
      select: WORK_ORDER_SELECT,
    });
    if (!order) {
      throw new NotFoundException('Ordem de serviço não encontrada');
    }
    return order;
  }

  private async assertUserExists(userId: string): Promise<void> {
    if (!(await this.users.findById(userId))) {
      throw new BadRequestException('Responsável não encontrado');
    }
  }
}
