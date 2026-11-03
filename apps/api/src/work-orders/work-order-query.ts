import type { Prisma } from '../generated/prisma/client';
import type { WorkOrderPriority, WorkOrderStatus } from '../generated/prisma/enums';

// Monta o `where` e o `orderBy` da listagem em funções puras: sem banco e sem relógio.
// O "agora" e o usuário chegam por parâmetro, então os testes são determinísticos.

export const SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export const ACTIVE_STATUSES: readonly WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS'];

export type WorkOrderFilters = {
  status?: WorkOrderStatus[];
  priority?: WorkOrderPriority[];
  /** UUID de um usuário ou `me`. */
  assigneeId?: string;
  overdue?: boolean;
  dueFrom?: Date;
  dueTo?: Date;
  q?: string;
};

export type QueryContext = {
  actorId: string;
  now: Date;
};

export const ME = 'me';

// `?status=OPEN, IN_PROGRESS,OPEN` → ['OPEN', 'IN_PROGRESS']. Também aceita o parâmetro repetido,
// que o Express entrega como array. Validar se cada valor existe no enum fica para o DTO.
export function parseList(value: unknown): unknown {
  const parts = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(parts) || !parts.every((part) => typeof part === 'string')) {
    return value;
  }
  const items = parts
    .flatMap((part: string) => part.split(','))
    .map((item) => item.trim())
    .filter((item) => item !== '');
  return [...new Set(items)];
}

// O `contains` do Prisma vira LIKE sem escapar nada: `%` e `_` virariam curingas e uma `\`
// solta quebraria a busca. Escapar os três faz o texto digitado valer literalmente.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function normalizeSearch(q: string | undefined): string | undefined {
  const trimmed = q?.trim();
  return trimmed ? trimmed : undefined;
}

// Regra única de "atrasada", usada pela lista e pelo painel.
// `lt` (e não `lte`): prazo exatamente igual a "agora" ainda não está atrasado.
export function overdueWhere(now: Date): Prisma.WorkOrderWhereInput {
  return { status: { in: [...ACTIVE_STATUSES] }, dueDate: { lt: now } };
}

export function buildWorkOrderWhere(
  filters: WorkOrderFilters,
  { actorId, now }: QueryContext,
): Prisma.WorkOrderWhereInput {
  // Cada filtro vira um item do AND. Assim `overdue` e o intervalo de prazo, que usam o mesmo
  // campo, não se sobrescrevem como aconteceria com duas chaves `dueDate` no mesmo objeto.
  const conditions: Prisma.WorkOrderWhereInput[] = [];

  if (filters.status?.length) {
    conditions.push({ status: { in: filters.status } });
  }
  if (filters.priority?.length) {
    conditions.push({ priority: { in: filters.priority } });
  }
  if (filters.assigneeId) {
    conditions.push({ assigneeId: filters.assigneeId === ME ? actorId : filters.assigneeId });
  }
  if (filters.overdue) {
    conditions.push(overdueWhere(now));
  }
  if (filters.dueFrom || filters.dueTo) {
    conditions.push({ dueDate: { gte: filters.dueFrom, lte: filters.dueTo } });
  }
  const q = normalizeSearch(filters.q);
  if (q) {
    const contains = escapeLike(q);
    conditions.push({
      OR: [
        { title: { contains, mode: 'insensitive' } },
        { description: { contains, mode: 'insensitive' } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

// O `id` no fim desempata itens com a mesma chave: sem ele, o Postgres pode devolver empates em
// qualquer ordem, e a paginação repetiria ou pularia itens entre uma página e outra.
export function buildWorkOrderOrderBy(
  sortBy: SortField = 'createdAt',
  order: SortOrder = 'desc',
): Prisma.WorkOrderOrderByWithRelationInput[] {
  return [{ [sortBy]: order }, { id: order }];
}

export function countPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}
