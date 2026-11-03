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
// consulta. Só acrescenta ordens com o prefixo abaixo; nunca apaga nem altera as do seed normal.

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
  for (let n = 1; n <= COUNT; n++) {
    // Criadas nos últimos 180 dias, com prazo de 1 a 45 dias depois: muitas já vencidas.
    const createdAt = new Date(now - Math.floor(random() * 180 * DAY_MS));
    const dueDate = new Date(createdAt.getTime() + (1 + Math.floor(random() * 45)) * DAY_MS);
    rows.push({
      title: `${VOLUME_PREFIX} ${pick(SUBJECTS)} - ${pick(PLACES)} #${n}`,
      description: random() < 0.2 ? null : `Ordem de volume número ${n}.`,
      priority: pick(PRIORITIES),
      status: pick(STATUS_POOL),
      assigneeId: random() < 0.15 ? null : pick(operators).id,
      createdById: supervisor.id,
      dueDate,
      createdAt,
      updatedAt: createdAt,
    });
  }

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await prisma.workOrder.createMany({ data: rows.slice(start, start + BATCH_SIZE) });
  }

  // Atualiza as estatísticas do planejador: sem isso, o EXPLAIN mostraria planos pensados
  // para a tabela pequena de antes.
  await prisma.$executeRawUnsafe('ANALYZE "WorkOrder"');

  console.log(
    `Seed de volume concluído: ${COUNT} ordens ${VOLUME_PREFIX} (sem eventos de histórico).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
