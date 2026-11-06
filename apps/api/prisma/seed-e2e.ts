import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import {
  type Prisma,
  PrismaClient,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../src/generated/prisma/client';
import { e2eDatabaseName } from '../src/scripts/e2e-database';

// Dados dos testes e2e: determinísticos (nenhum sorteio) e fictícios. Datas relativas a "agora",
// para as atrasadas continuarem atrasadas e as demais no futuro em qualquer dia em que rodar.
// Só roda num banco `_e2e` (apaga tudo antes). A senha vem do ambiente do e2e.

const databaseUrl = process.env.DATABASE_URL ?? '';
e2eDatabaseName(databaseUrl);
if (!process.env.E2E_PASSWORD) {
  throw new Error('E2E_PASSWORD não definida: o seed do e2e não tem senha padrão');
}
const password: string = process.env.E2E_PASSWORD;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const E2E_USERS = {
  supervisor: { name: 'Sílvia Supervisora', email: 'supervisora@e2e.opsboard.test' },
  operator: { name: 'Otávio Operador', email: 'otavio@e2e.opsboard.test' },
  otherOperator: { name: 'Olga Operadora', email: 'olga@e2e.opsboard.test' },
} as const;

const STATUSES: WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const PRIORITIES: WorkOrderPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const TASKS = [
  'Trocar lâmpada',
  'Revisar extintor',
  'Consertar porta',
  'Limpar calha',
  'Pintar parede',
];
const PLACES = [
  'recepção',
  'copa',
  'almoxarifado',
  'estacionamento',
  'sala 2',
  '3º andar',
  'expedição',
  'oficina',
  'auditório',
];

async function main() {
  await prisma.workOrderEvent.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash(password, 4);
  const create = (key: keyof typeof E2E_USERS, role: 'OPERATOR' | 'SUPERVISOR') =>
    prisma.user.create({ data: { ...E2E_USERS[key], role, passwordHash } });
  const supervisor = await create('supervisor', 'SUPERVISOR');
  const operator = await create('operator', 'OPERATOR');
  const otherOperator = await create('otherOperator', 'OPERATOR');

  const now = Date.now();
  const total = TASKS.length * PLACES.length; // 45 títulos únicos
  let overdue = 0;

  for (let index = 0; index < total; index++) {
    const title = `[seed] ${TASKS[index % TASKS.length]} - ${PLACES[Math.floor(index / TASKS.length)]}`;
    const status = STATUSES[index % STATUSES.length];
    const priority = PRIORITIES[Math.floor(index / STATUSES.length) % PRIORITIES.length];
    const assignee = [null, operator, otherOperator][index % 3];
    // Prazo vencido em 1 de cada 5 (e mais alguns); nas ativas, isso é "atrasada".
    const pastDue = index % 5 === 0 || index % 11 === 0;
    const dueDate = new Date(now + (pastDue ? -(2 + (index % 7)) : 3 + (index % 20)) * DAY_MS);
    if (pastDue && (status === 'OPEN' || status === 'IN_PROGRESS')) overdue++;

    // Cronologia coerente e no passado: criada, atribuída, editada, iniciada, finalizada.
    const createdAt = new Date(now - (60 - index) * DAY_MS);
    const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR_MS);
    const worker = assignee?.id ?? supervisor.id;
    const edited = index % 7 === 0;
    const originalTitle = edited ? `${title} (rascunho)` : title;

    const events: Prisma.WorkOrderEventCreateWithoutWorkOrderInput[] = [];
    const add = (event: {
      actorId: string;
      type: Prisma.WorkOrderEventCreateWithoutWorkOrderInput['type'];
      fromStatus?: WorkOrderStatus;
      toStatus?: WorkOrderStatus;
      payload: Prisma.InputJsonValue;
      createdAt: Date;
    }) =>
      events.push({
        actor: { connect: { id: event.actorId } },
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        payload: event.payload,
        createdAt: event.createdAt,
      });

    add({
      actorId: supervisor.id,
      type: 'CREATED',
      toStatus: 'OPEN',
      createdAt,
      payload: {
        title: originalTitle,
        description: null,
        priority,
        dueDate: dueDate.toISOString(),
        assigneeId: null,
      },
    });
    if (assignee) {
      add({
        actorId: supervisor.id,
        type: 'ASSIGNED',
        createdAt: at(1),
        payload: { from: null, to: assignee.id },
      });
    }
    if (edited) {
      add({
        actorId: supervisor.id,
        type: 'UPDATED',
        createdAt: at(2),
        payload: { title: { from: originalTitle, to: title } },
      });
    }
    const change = (actorId: string, from: WorkOrderStatus, to: WorkOrderStatus, hours: number) =>
      add({
        actorId,
        type: 'STATUS_CHANGED',
        fromStatus: from,
        toStatus: to,
        payload: {},
        createdAt: at(hours),
      });
    if (status === 'IN_PROGRESS' || status === 'DONE') change(worker, 'OPEN', 'IN_PROGRESS', 24);
    if (status === 'DONE') change(worker, 'IN_PROGRESS', 'DONE', 48);
    if (status === 'CANCELLED') change(supervisor.id, 'OPEN', 'CANCELLED', 24);

    await prisma.workOrder.create({
      data: {
        title,
        description: index % 2 === 0 ? `Ordem de teste ${index + 1} do seed e2e.` : null,
        priority,
        status,
        assigneeId: assignee?.id ?? null,
        createdById: supervisor.id,
        dueDate,
        createdAt,
        updatedAt: events.at(-1)?.createdAt ?? createdAt,
        events: { create: events },
      },
    });
  }

  console.log(`Seed e2e concluído: 3 usuários, ${total} ordens [seed], ${overdue} atrasadas.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
