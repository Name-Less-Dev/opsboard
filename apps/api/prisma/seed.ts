import path from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import {
  type Prisma,
  PrismaClient,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../src/generated/prisma/client';

config({ path: path.resolve(__dirname, '../../../.env') });

// Senhas conhecidas e exclusão de todos os dados: isto nunca deve rodar em produção.
if (process.env.NODE_ENV === 'production') {
  throw new Error('O seed é só para desenvolvimento e não roda com NODE_ENV=production');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL não definida');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

// Credencial de demonstração, documentada no README e gravada só como hash.
const DEV_PASSWORD = 'opsboard123';
const BCRYPT_COST = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

type SeedOrder = {
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assignee: 'ana' | 'bruno' | null;
  dueInDays: number; // negativo = prazo já passou
  /** Passos extras do histórico, antes de a ordem ser iniciada. */
  extra?: 'reassign' | 'unassign' | 'editContent' | 'editPlanning';
};

const orders: SeedOrder[] = [
  {
    title: 'Trocar filtro do ar-condicionado da sala 2',
    description: 'Filtro saturado, equipe reclamou de cheiro.',
    priority: 'MEDIUM',
    status: 'OPEN',
    assignee: 'ana',
    dueInDays: 3,
    extra: 'editContent',
  },
  {
    title: 'Vazamento na pia da copa',
    description: 'Água acumulando embaixo do gabinete.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assignee: 'bruno',
    dueInDays: -1,
    extra: 'reassign',
  },
  {
    title: 'Impressora do RH não conecta na rede',
    description: 'Erro de IP desde a troca do roteador.',
    priority: 'LOW',
    status: 'OPEN',
    assignee: null,
    dueInDays: -1,
    extra: 'unassign',
  },
  {
    title: 'Lâmpadas queimadas no estacionamento',
    description: 'Três pontos apagados no setor B.',
    priority: 'MEDIUM',
    status: 'DONE',
    assignee: 'ana',
    dueInDays: -5,
  },
  {
    title: 'Porta corta-fogo travando',
    description: 'Porta da escada 3 não fecha sozinha.',
    priority: 'URGENT',
    status: 'OPEN',
    assignee: 'bruno',
    dueInDays: -2,
  },
  {
    title: 'Revisão preventiva do gerador',
    description: 'Revisão trimestral prevista em contrato.',
    priority: 'HIGH',
    status: 'OPEN',
    assignee: 'ana',
    dueInDays: 10,
    extra: 'editPlanning',
  },
  {
    title: 'Instalar suporte de TV na sala de reunião',
    description: 'Suporte já comprado, falta instalar.',
    priority: 'LOW',
    status: 'CANCELLED',
    assignee: null,
    dueInDays: 4,
  },
  {
    title: 'Ruído no elevador social',
    description: 'Barulho metálico entre o 2º e o 3º andar.',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    assignee: 'bruno',
    dueInDays: 1,
  },
  {
    title: 'Pintura da recepção',
    description: null,
    priority: 'LOW',
    status: 'OPEN',
    assignee: 'ana',
    dueInDays: -3,
  },
  {
    title: 'Trocar fechadura do almoxarifado',
    description: 'Chave reserva perdida.',
    priority: 'MEDIUM',
    status: 'DONE',
    assignee: 'bruno',
    dueInDays: 2,
  },
];

async function main(): Promise<void> {
  // Ordem de exclusão respeita as chaves estrangeiras.
  await prisma.workOrderEvent.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash(DEV_PASSWORD, BCRYPT_COST);

  const supervisor = await prisma.user.create({
    data: {
      name: 'Carla Supervisora',
      email: 'supervisor@opsboard.dev',
      passwordHash,
      role: 'SUPERVISOR',
    },
  });
  const ana = await prisma.user.create({
    data: { name: 'Ana Operadora', email: 'ana@opsboard.dev', passwordHash, role: 'OPERATOR' },
  });
  const bruno = await prisma.user.create({
    data: { name: 'Bruno Operador', email: 'bruno@opsboard.dev', passwordHash, role: 'OPERATOR' },
  });
  const operators = { ana, bruno };

  const HOUR_MS = 60 * 60 * 1000;

  for (const [index, order] of orders.entries()) {
    const assigneeId = order.assignee ? operators[order.assignee].id : null;
    const dueDate = daysFromNow(order.dueInDays);
    // Cronologia coerente: a ordem nasce, recebe responsável e edições nas primeiras horas, é
    // iniciada no dia seguinte e finalizada no outro; tudo antes de agora.
    const createdAt = daysFromNow(-(orders.length - index) - 5);
    const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR_MS);
    const worker = assigneeId ?? supervisor.id;

    // Valores na criação: as edições extras partem deles e chegam aos valores atuais da ordem.
    const original = {
      title: order.extra === 'editContent' ? 'Trocar filtro do ar' : order.title,
      description: order.extra === 'editContent' ? null : order.description,
      priority: order.extra === 'editPlanning' ? ('MEDIUM' as const) : order.priority,
      dueDate: order.extra === 'editPlanning' ? new Date(dueDate.getTime() - 3 * DAY_MS) : dueDate,
    };

    // Payloads no mesmo formato que a API grava (WorkOrdersService).
    const events: Prisma.WorkOrderEventCreateWithoutWorkOrderInput[] = [];
    const add = (event: Omit<Prisma.WorkOrderEventUncheckedCreateInput, 'workOrderId'>) =>
      events.push({
        actor: { connect: { id: event.actorId } },
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        payload: event.payload,
        createdAt: event.createdAt,
      });
    const assign = (from: string | null, to: string | null, hours: number) =>
      add({
        actorId: supervisor.id,
        type: 'ASSIGNED',
        payload: { from, to },
        createdAt: at(hours),
      });

    // Criada sem responsável pela supervisora, que atribui em seguida.
    add({
      actorId: supervisor.id,
      type: 'CREATED',
      toStatus: 'OPEN',
      createdAt,
      payload: {
        title: original.title,
        description: original.description,
        priority: original.priority,
        dueDate: original.dueDate.toISOString(),
        assigneeId: null,
      },
    });
    if (order.extra === 'reassign') {
      assign(null, ana.id, 1);
      assign(ana.id, assigneeId, 2);
    } else if (order.extra === 'unassign') {
      assign(null, ana.id, 1);
      assign(ana.id, null, 2);
    } else if (assigneeId) {
      assign(null, assigneeId, 1);
    }
    if (order.extra === 'editContent') {
      add({
        actorId: worker,
        type: 'UPDATED',
        createdAt: at(3),
        payload: {
          title: { from: original.title, to: order.title },
          description: { from: original.description, to: order.description },
        },
      });
    }
    if (order.extra === 'editPlanning') {
      add({
        actorId: supervisor.id,
        type: 'UPDATED',
        createdAt: at(3),
        payload: {
          priority: { from: original.priority, to: order.priority },
          dueDate: { from: original.dueDate.toISOString(), to: dueDate.toISOString() },
        },
      });
    }

    const status = (actorId: string, from: WorkOrderStatus, to: WorkOrderStatus, hours: number) =>
      add({
        actorId,
        type: 'STATUS_CHANGED',
        fromStatus: from,
        toStatus: to,
        payload: {},
        createdAt: at(hours),
      });
    if (order.status === 'IN_PROGRESS' || order.status === 'DONE') {
      status(worker, 'OPEN', 'IN_PROGRESS', 24);
    }
    if (order.status === 'DONE') status(worker, 'IN_PROGRESS', 'DONE', 48);
    if (order.status === 'CANCELLED') status(supervisor.id, 'OPEN', 'CANCELLED', 24);

    await prisma.workOrder.create({
      data: {
        title: order.title,
        description: order.description,
        priority: order.priority,
        status: order.status,
        assigneeId,
        createdById: supervisor.id,
        dueDate,
        createdAt,
        updatedAt: events.at(-1)?.createdAt ?? createdAt,
        events: { create: events },
      },
    });
  }

  console.log(`Seed concluído: 3 usuários, ${orders.length} ordens de serviço.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
