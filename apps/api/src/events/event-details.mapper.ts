import { WorkOrderPriority, type WorkOrderEventType } from '../generated/prisma/enums';

// Traduz o `payload` gravado pelo Dia 3 (WorkOrdersService) para o `details` público, por tipo.
// Função pura, sem Prisma. O payload é JSON livre no banco, então tudo é conferido antes de usar:
// formato inesperado (evento antigo, chave desconhecida, tipo errado) vira `null`, nunca exceção.
//
// Formato real gravado:
//   UPDATED  → { title?: {from,to}, description?: {from,to}, priority?: {from,to}, dueDate?: {from,to} }
//   ASSIGNED → { from: userId | null, to: userId | null }
//   CREATED e STATUS_CHANGED não têm details (o status vai em fromStatus/toStatus).

export const UPDATABLE_FIELDS = ['title', 'description', 'priority', 'dueDate'] as const;
export type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export type UpdatedChange =
  | { field: 'title'; from: string; to: string }
  | { field: 'priority'; from: WorkOrderPriority; to: WorkOrderPriority }
  | { field: 'dueDate'; from: string; to: string }
  // Descrição: só o nome do campo. O texto pode ter dado sensível e não sai pela API.
  | { field: 'description' };

export type UpdatedDetails = { changes: UpdatedChange[] };
export type UserRef = { id: string; name: string | null };
export type AssignedDetails = { from: UserRef | null; to: UserRef | null };
export type EventDetails = UpdatedDetails | AssignedDetails | null;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Objeto com exatamente estas chaves (nem a mais, nem a menos). */
function hasExactKeys(value: PlainObject, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => key in value);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const isPriority = (value: unknown): value is WorkOrderPriority =>
  isString(value) && (Object.values(WorkOrderPriority) as string[]).includes(value);
const isIsoDate = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value));

function mapChange(field: UpdatableField, raw: unknown): UpdatedChange | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['from', 'to'])) return null;
  const { from, to } = raw;
  switch (field) {
    case 'title':
      return isString(from) && isString(to) ? { field, from, to } : null;
    case 'priority':
      return isPriority(from) && isPriority(to) ? { field, from, to } : null;
    case 'dueDate':
      return isIsoDate(from) && isIsoDate(to) ? { field, from, to } : null;
    case 'description':
      return isNullableString(from) && isNullableString(to) ? { field } : null;
  }
}

function mapUpdated(payload: unknown): UpdatedDetails | null {
  if (!isPlainObject(payload)) return null;
  const keys = Object.keys(payload);
  const known = (key: string) => (UPDATABLE_FIELDS as readonly string[]).includes(key);
  if (keys.length === 0 || !keys.every(known)) return null;

  const changes: UpdatedChange[] = [];
  // Ordem fixa dos campos, não a do JSON gravado.
  for (const field of UPDATABLE_FIELDS) {
    if (!(field in payload)) continue;
    const change = mapChange(field, payload[field]);
    if (change === null) return null;
    changes.push(change);
  }
  return { changes };
}

/** `{ from, to }` com ids (ou null) válidos, senão null. */
function parseAssigned(payload: unknown): { from: string | null; to: string | null } | null {
  if (!isPlainObject(payload) || !hasExactKeys(payload, ['from', 'to'])) return null;
  const { from, to } = payload;
  return isNullableString(from) && isNullableString(to) ? { from, to } : null;
}

/**
 * Ids de usuário citados nas atribuições, sem repetir, para o service buscar todos os nomes da
 * página numa consulta só.
 */
export function assignedUserIds(
  events: readonly { type: WorkOrderEventType; payload: unknown }[],
): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== 'ASSIGNED') continue;
    const parsed = parseAssigned(event.payload);
    if (parsed?.from) ids.add(parsed.from);
    if (parsed?.to) ids.add(parsed.to);
  }
  return [...ids];
}

/**
 * `details` público do evento. `userNames` vem de uma consulta só (ver `assignedUserIds`);
 * usuário que não existe mais sai com `name: null`.
 */
export function mapEventDetails(
  type: WorkOrderEventType,
  payload: unknown,
  userNames: ReadonlyMap<string, string>,
): EventDetails {
  switch (type) {
    case 'CREATED':
    case 'STATUS_CHANGED':
      return null;
    case 'UPDATED':
      return mapUpdated(payload);
    case 'ASSIGNED': {
      const parsed = parseAssigned(payload);
      if (!parsed) return null;
      const ref = (id: string | null): UserRef | null =>
        id === null ? null : { id, name: userNames.get(id) ?? null };
      return { from: ref(parsed.from), to: ref(parsed.to) };
    }
  }
}
