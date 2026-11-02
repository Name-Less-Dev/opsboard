import path from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { PrismaClient, WorkOrderPriority, WorkOrderStatus } from '../src/generated/prisma/client';

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
};

const orders: SeedOrder[] = [
  {
    title: 'Trocar filtro do ar-condicionado da sala 2',
    description: 'Filtro saturado, equipe reclamou de cheiro.',
    priority: 'MEDIUM',
    status: 'OPEN',
    assignee: 'ana',
    dueInDays: 3,
  },
  {
    title: 'Vazamento na pia da copa',
    description: 'Água acumulando embaixo do gabinete.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assignee: 'bruno',
    dueInDays: -1,
  },
  {
    title: 'Impressora do RH não conecta na rede',
    description: 'Erro de IP desde a troca do roteador.',
    priority: 'LOW',
    status: 'OPEN',
    assignee: null,
    dueInDays: -1,
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

  for (const [index, order] of orders.entries()) {
    const assigneeId = order.assignee ? operators[order.assignee].id : null;
    const dueDate = daysFromNow(order.dueInDays);
    // Cronologia coerente: toda ordem nasce antes do próprio prazo e das mudanças de status.
    const createdAt = daysFromNow(-(orders.length - index) - 5);
    const startedAt = new Date(createdAt.getTime() + DAY_MS);
    const finishedAt = new Date(createdAt.getTime() + 2 * DAY_MS);
    const worker = assigneeId ?? supervisor.id;

    const changes: {
      actorId: string;
      fromStatus: WorkOrderStatus;
      toStatus: WorkOrderStatus;
      createdAt: Date;
    }[] = [];
    if (order.status === 'IN_PROGRESS' || order.status === 'DONE') {
      changes.push({
        actorId: worker,
        fromStatus: 'OPEN',
        toStatus: 'IN_PROGRESS',
        createdAt: startedAt,
      });
    }
    if (order.status === 'DONE') {
      changes.push({
        actorId: worker,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'DONE',
        createdAt: finishedAt,
      });
    }
    if (order.status === 'CANCELLED') {
      changes.push({
        actorId: supervisor.id,
        fromStatus: 'OPEN',
        toStatus: 'CANCELLED',
        createdAt: startedAt,
      });
    }

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
        updatedAt: changes.at(-1)?.createdAt ?? createdAt,
        events: {
          create: [
            {
              actorId: supervisor.id,
              type: 'CREATED',
              toStatus: 'OPEN',
              createdAt,
              // Mesmo formato que a API grava ao criar uma ordem.
              payload: {
                title: order.title,
                description: order.description,
                priority: order.priority,
                dueDate: dueDate.toISOString(),
                assigneeId,
              },
            },
            ...changes.map((change) => ({
              ...change,
              type: 'STATUS_CHANGED' as const,
              payload: {},
            })),
          ],
        },
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
