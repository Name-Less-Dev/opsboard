import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type Prisma,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../src/generated/prisma/client';

// Seed de VOLUME, opcional (npm run seed:large): ~5.000 ordens para testar paginação e planos de
// consulta, cada uma com histórico coerente (CREATED e as mudanças de status), mais uma ordem com
// histórico longo para paginar a linha do tempo. Só acrescenta ordens com o prefixo abaixo (os
// eventos saem junto, em cascata); nunca apaga nem altera as do seed normal.

config({ path: path.resolve(__dirname, '../../../.env') });

if (process.env.NODE_ENV === 'production') {
  throw new Error('O seed de volume é só para desenvolvimento e não roda com NODE_ENV=production');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL não definida');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const VOLUME_PREFIX = '[volume]';
const COUNT = 5000;
const BATCH_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Gerador pseudoaleatório com semente fixa (mulberry32): os mesmos dados a cada execução,
// para os planos de consulta serem comparáveis entre uma rodada e outra.
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(42);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

// Peso de cada status: a maioria das ordens antigas já foi concluída.
const STATUS_POOL: WorkOrderStatus[] = [
  ...Array<WorkOrderStatus>(3).fill('OPEN'),
  ...Array<WorkOrderStatus>(2).fill('IN_PROGRESS'),
  ...Array<WorkOrderStatus>(4).fill('DONE'),
  'CANCELLED',
];
const PRIORITIES = Object.values(WorkOrderPriority);
const SUBJECTS = [
  'Trocar filtro do ar-condicionado',
  'Vazamento na tubulação',
  'Lâmpada queimada',
  'Revisão preventiva do gerador',
  'Porta travando',
  'Impressora sem rede',
  'Pintura descascando',
  'Ruído no elevador',
  'Fechadura com defeito',
  'Manutenção do portão',
];
const PLACES = ['sala 2', 'recepção', 'copa', 'estacionamento', 'almoxarifado', '3º andar'];

const LONG_HISTORY_TITLE = `${VOLUME_PREFIX} Ordem com histórico longo`;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Uma ordem em andamento com 28 eventos, para paginar a linha do tempo (10 por página no front):
 * criação, 13 trocas de responsável alternadas com 13 mudanças de prioridade, e o início. O
 * último `toStatus` (IN_PROGRESS) bate com o status da ordem.
 */
function addLongHistory(
  rows: Prisma.WorkOrderCreateManyInput[],
  events: Prisma.WorkOrderEventCreateManyInput[],
  supervisorId: string,
  anaId: string,
  brunoId: string,
  now: number,
): number {
  const id = randomUUID();
  const createdAt = new Date(now - 30 * DAY_MS);
  const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR_MS);
  const dueDate = new Date(now + 15 * DAY_MS);
  const cycle: WorkOrderPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  const own: Prisma.WorkOrderEventCreateManyInput[] = [
    {
      workOrderId: id,
      actorId: supervisorId,
      type: 'CREATED',
      toStatus: 'OPEN',
      createdAt,
      payload: {
        title: LONG_HISTORY_TITLE,
        description: 'Ordem de exemplo para paginar o histórico.',
        priority: 'LOW',
        dueDate: dueDate.toISOString(),
        assigneeId: null,
      },
    },
  ];
  let assignee: string | null = null;
  for (let step = 0; step < 13; step++) {
    const next: string = step % 2 === 0 ? anaId : brunoId;
    own.push({
      workOrderId: id,
      actorId: supervisorId,
      type: 'ASSIGNED',
      createdAt: at(step * 10 + 1),
      payload: { from: assignee, to: next },
    });
    assignee = next;
    own.push({
      workOrderId: id,
      actorId: supervisorId,
      type: 'UPDATED',
      createdAt: at(step * 10 + 5),
      payload: { priority: { from: cycle[step % 4], to: cycle[(step + 1) % 4] } },
    });
  }
  own.push({
    workOrderId: id,
    actorId: assignee ?? supervisorId,
    type: 'STATUS_CHANGED',
    fromStatus: 'OPEN',
    toStatus: 'IN_PROGRESS',
    payload: {},
    createdAt: at(200),
  });

  events.push(...own);
  rows.push({
    id,
    title: LONG_HISTORY_TITLE,
    description: 'Ordem de exemplo para paginar o histórico.',
    priority: cycle[13 % 4],
    status: 'IN_PROGRESS',
    assigneeId: assignee,
    createdById: supervisorId,
    dueDate,
    createdAt,
    updatedAt: at(200),
  });
  return own.length;
}

async function main(): Promise<void> {
  const supervisor = await prisma.user.findFirst({ where: { role: 'SUPERVISOR' } });
  const operators = await prisma.user.findMany({ where: { role: 'OPERATOR' } });
  if (!supervisor || operators.length === 0) {
    throw new Error('Rode o seed normal antes (npm run db:seed): faltam usuários.');
  }

  const removed = await prisma.workOrder.deleteMany({
    where: { title: { startsWith: VOLUME_PREFIX } },
  });
  if (removed.count > 0) {
    console.log(
      `Aviso: removidas ${removed.count} ordens ${VOLUME_PREFIX} de uma execução anterior.`,
    );
  }

  const now = Date.now();
  const rows: Prisma.WorkOrderCreateManyInput[] = [];
  const events: Prisma.WorkOrderEventCreateManyInput[] = [];
  for (let n = 1; n <= COUNT; n++) {
    // Criadas nos últimos 180 dias, com prazo de 1 a 45 dias depois: muitas já vencidas.
    const createdAt = new Date(now - Math.floor(random() * 180 * DAY_MS));
    const dueDate = new Date(createdAt.getTime() + (1 + Math.floor(random() * 45)) * DAY_MS);
    const id = randomUUID();
    const status = pick(STATUS_POOL);
    const assigneeId = random() < 0.15 ? null : pick(operators).id;
    const title = `${VOLUME_PREFIX} ${pick(SUBJECTS)} - ${pick(PLACES)} #${n}`;
    const description = random() < 0.2 ? null : `Ordem de volume número ${n}.`;
    const priority = pick(PRIORITIES);
    // Histórico sem sorteio (para não mudar a sequência dos dados): mudanças de status em
    // frações fixas do tempo entre a criação e agora, então nunca caem no futuro.
    const step = (fraction: number) =>
      new Date(createdAt.getTime() + Math.floor((now - createdAt.getTime()) * fraction));
    events.push({
      workOrderId: id,
      actorId: supervisor.id,
      type: 'CREATED',
      toStatus: 'OPEN',
      createdAt,
      payload: { title, description, priority, dueDate: dueDate.toISOString(), assigneeId },
    });
    const worker = assigneeId ?? supervisor.id;
    const change = (actorId: string, from: WorkOrderStatus, to: WorkOrderStatus, at: Date) =>
      events.push({
        workOrderId: id,
        actorId,
        type: 'STATUS_CHANGED',
        fromStatus: from,
        toStatus: to,
        payload: {},
        createdAt: at,
      });
    if (status === 'IN_PROGRESS' || status === 'DONE') {
      change(worker, 'OPEN', 'IN_PROGRESS', step(0.3));
    }
    if (status === 'DONE') change(worker, 'IN_PROGRESS', 'DONE', step(0.6));
    if (status === 'CANCELLED') change(supervisor.id, 'OPEN', 'CANCELLED', step(0.3));

    rows.push({
      id,
      title,
      description,
      priority,
      status,
      assigneeId,
      createdById: supervisor.id,
      dueDate,
      createdAt,
      updatedAt: events.at(-1)?.createdAt ?? createdAt,
    });
  }

  const longHistoryEvents = addLongHistory(
    rows,
    events,
    supervisor.id,
    operators[0].id,
    operators[1]?.id ?? operators[0].id,
    now,
  );

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await prisma.workOrder.createMany({ data: rows.slice(start, start + BATCH_SIZE) });
  }
  for (let start = 0; start < events.length; start += BATCH_SIZE) {
    await prisma.workOrderEvent.createMany({ data: events.slice(start, start + BATCH_SIZE) });
  }

  // Atualiza as estatísticas do planejador: sem isso, o EXPLAIN mostraria planos pensados
  // para a tabela pequena de antes.
  await prisma.$executeRawUnsafe('ANALYZE "WorkOrder"');
  await prisma.$executeRawUnsafe('ANALYZE "WorkOrderEvent"');

  console.log(
    `Seed de volume concluído: ${rows.length} ordens ${VOLUME_PREFIX} e ${events.length} eventos ` +
      `(a ordem "${LONG_HISTORY_TITLE}" tem ${longHistoryEvents} eventos).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
