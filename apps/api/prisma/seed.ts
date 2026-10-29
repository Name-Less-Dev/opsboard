import path from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import {
  PrismaClient,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../src/generated/prisma/client';

config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL não definida');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

// Senha única de desenvolvimento para todos os usuários do seed.
const DEV_PASSWORD = 'opsboard123';
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

type SeedOrder = {
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assignee: 'ana' | 'bruno' | null;
  dueInDays: number; // negativo = prazo já passou
};

const orders: SeedOrder[] = [
  { title: 'Trocar filtro do ar-condicionado da sala 2', description: 'Filtro saturado, equipe reclamou de cheiro.', priority: 'MEDIUM', status: 'OPEN', assignee: 'ana', dueInDays: 3 },
  { title: 'Vazamento na pia da copa', description: 'Água acumulando embaixo do gabinete.', priority: 'HIGH', status: 'IN_PROGRESS', assignee: 'bruno', dueInDays: -1 },
  { title: 'Impressora do RH não conecta na rede', description: 'Erro de IP desde a troca do roteador.', priority: 'LOW', status: 'OPEN', assignee: null, dueInDays: 7 },
  { title: 'Lâmpadas queimadas no estacionamento', description: 'Três pontos apagados no setor B.', priority: 'MEDIUM', status: 'DONE', assignee: 'ana', dueInDays: -5 },
  { title: 'Porta corta-fogo travando', description: 'Porta da escada 3 não fecha sozinha.', priority: 'URGENT', status: 'OPEN', assignee: 'bruno', dueInDays: -2 },
  { title: 'Revisão preventiva do gerador', description: 'Revisão trimestral prevista em contrato.', priority: 'HIGH', status: 'OPEN', assignee: 'ana', dueInDays: 10 },
  { title: 'Instalar suporte de TV na sala de reunião', description: 'Suporte já comprado, falta instalar.', priority: 'LOW', status: 'CANCELLED', assignee: null, dueInDays: 4 },
  { title: 'Ruído no elevador social', description: 'Barulho metálico entre o 2º e o 3º andar.', priority: 'URGENT', status: 'IN_PROGRESS', assignee: 'bruno', dueInDays: 1 },
  { title: 'Pintura da recepção', description: 'Marcas na parede atrás do balcão.', priority: 'LOW', status: 'OPEN', assignee: 'ana', dueInDays: -3 },
  { title: 'Trocar fechadura do almoxarifado', description: 'Chave reserva perdida.', priority: 'MEDIUM', status: 'DONE', assignee: 'bruno', dueInDays: 2 },
];

async function main(): Promise<void> {
  // Ordem de exclusão respeita as chaves estrangeiras.
  await prisma.workOrderEvent.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash(DEV_PASSWORD, 10);

  const supervisor = await prisma.user.create({
    data: { name: 'Carla Supervisora', email: 'supervisor@opsboard.dev', passwordHash, role: 'SUPERVISOR' },
  });
  const ana = await prisma.user.create({
    data: { name: 'Ana Operadora', email: 'ana@opsboard.dev', passwordHash, role: 'OPERATOR' },
  });
  const bruno = await prisma.user.create({
    data: { name: 'Bruno Operador', email: 'bruno@opsboard.dev', passwordHash, role: 'OPERATOR' },
  });
  const operators = { ana, bruno };

  for (const order of orders) {
    const assigneeId = order.assignee ? operators[order.assignee].id : null;
    const workOrder = await prisma.workOrder.create({
      data: {
        title: order.title,
        description: order.description,
        priority: order.priority,
        status: order.status,
        assigneeId,
        createdById: supervisor.id,
        dueDate: daysFromNow(order.dueInDays),
      },
    });

    // Histórico coerente com o estado final da ordem.
    await prisma.workOrderEvent.create({
      data: { workOrderId: workOrder.id, actorId: supervisor.id, type: 'CREATED', toStatus: 'OPEN', payload: { title: order.title } },
    });
    if (order.status === 'IN_PROGRESS' || order.status === 'DONE') {
      await prisma.workOrderEvent.create({
        data: { workOrderId: workOrder.id, actorId: assigneeId ?? supervisor.id, type: 'STATUS_CHANGED', fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', payload: {} },
      });
    }
    if (order.status === 'DONE') {
      await prisma.workOrderEvent.create({
        data: { workOrderId: workOrder.id, actorId: assigneeId ?? supervisor.id, type: 'STATUS_CHANGED', fromStatus: 'IN_PROGRESS', toStatus: 'DONE', payload: {} },
      });
    }
    if (order.status === 'CANCELLED') {
      await prisma.workOrderEvent.create({
        data: { workOrderId: workOrder.id, actorId: supervisor.id, type: 'STATUS_CHANGED', fromStatus: 'OPEN', toStatus: 'CANCELLED', payload: {} },
      });
    }
  }

  console.log(`Seed concluído: 3 usuários, ${orders.length} ordens de serviço.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
