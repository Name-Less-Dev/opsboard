import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  buildDemoOrders,
  DEMO_PASSWORD,
  DEMO_USERS,
  type DemoEvent,
  type DemoUserKey,
} from '../src/scripts/demo-data';
import {
  assertDemoResetAllowed,
  confirmationMatches,
  describeDatabaseTarget,
} from '../src/scripts/demo-guard';

// Redefine a demonstração pública: APAGA usuários, ordens e eventos do banco apontado por
// DATABASE_URL e recria os dados fictícios. Exige ALLOW_DEMO_RESET=true e o host digitado.
// Não lê o .env sozinho: a URL precisa ser passada de propósito, na linha de comando.

async function confirm(host: string, database: string): Promise<boolean> {
  console.log(`\nBanco alvo: host "${host}", banco "${database}".`);
  console.log('Todos os usuários, ordens e eventos desse banco serão APAGADOS e recriados.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await prompt.question('Para confirmar, digite o host do banco: ');
    return confirmationMatches(typed, { host, database });
  } finally {
    prompt.close();
  }
}

function eventData(
  event: DemoEvent,
  ids: Record<DemoUserKey, string>,
): Prisma.WorkOrderEventCreateWithoutWorkOrderInput {
  const base = { actor: { connect: { id: ids[event.actor] } }, createdAt: event.at };
  switch (event.type) {
    case 'CREATED':
      // Mesmo formato da API (WorkOrdersService): criada sem responsável, atribuída em seguida.
      return {
        ...base,
        type: 'CREATED',
        toStatus: 'OPEN',
        payload: {
          ...event.snapshot,
          dueDate: event.snapshot.dueDate.toISOString(),
          assigneeId: null,
        },
      };
    case 'ASSIGNED':
      return {
        ...base,
        type: 'ASSIGNED',
        payload: { from: event.from && ids[event.from], to: ids[event.to] },
      };
    case 'UPDATED':
      return { ...base, type: 'UPDATED', payload: { title: event.title } };
    case 'STATUS_CHANGED':
      return {
        ...base,
        type: 'STATUS_CHANGED',
        fromStatus: event.from,
        toStatus: event.to,
        payload: {},
      };
  }
}

async function main() {
  assertDemoResetAllowed(process.env);
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  if (!(await confirm(target.host, target.database))) {
    throw new Error('Confirmação não confere com o host. Nada foi alterado.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const passwordHash = await hash(DEMO_PASSWORD, 10);
    const orders = buildDemoOrders(new Date());
    await prisma.$transaction(
      async (tx) => {
        // Só as tabelas do OpsBoard (as migrations do Prisma ficam intactas).
        await tx.workOrderEvent.deleteMany();
        await tx.workOrder.deleteMany();
        await tx.user.deleteMany();

        const ids = {} as Record<DemoUserKey, string>;
        for (const [key, user] of Object.entries(DEMO_USERS) as [
          DemoUserKey,
          (typeof DEMO_USERS)[DemoUserKey],
        ][]) {
          ids[key] = (await tx.user.create({ data: { ...user, passwordHash } })).id;
        }

        for (const order of orders) {
          const assigneeId = order.assignee ? ids[order.assignee] : null;
          await tx.workOrder.create({
            data: {
              title: order.title,
              description: order.description,
              priority: order.priority,
              status: order.status,
              dueDate: order.dueDate,
              assigneeId,
              createdById: ids.supervisor,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
              events: { create: order.events.map((event) => eventData(event, ids)) },
            },
          });
        }
      },
      { timeout: 60_000 },
    );
    console.log(`Demonstração redefinida: 3 usuários e ${orders.length} ordens fictícias.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
