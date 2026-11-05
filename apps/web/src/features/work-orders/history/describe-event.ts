import { formatDateTime } from '../../../lib/format';
import { PRIORITY_LABELS, STATUS_LABELS, type WorkOrderStatus } from '../labels';
import type { FieldChange, WorkOrderEvent } from './history-types';

// Único lugar que transforma um evento do histórico em texto. Lê os `details` pelo tipo do
// contrato gerado, mas não confia cegamente: tipo ou formato inesperado vira texto genérico.

const FIELD_NAMES: Record<FieldChange['field'], { bare: string; withArticle: string }> = {
  title: { bare: 'título', withArticle: 'o título' },
  description: { bare: 'descrição', withArticle: 'a descrição' },
  priority: { bare: 'prioridade', withArticle: 'a prioridade' },
  dueDate: { bare: 'prazo', withArticle: 'o prazo' },
};

/** "a", "a e b", "a, b e c". */
function joinList(items: string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

const isKnownField = (field: unknown): field is FieldChange['field'] =>
  typeof field === 'string' && field in FIELD_NAMES;

function describeStatus(actor: string, from: WorkOrderStatus | null, to: WorkOrderStatus | null) {
  if (from === 'OPEN' && to === 'IN_PROGRESS') {
    return `${actor} iniciou a ordem (${STATUS_LABELS.OPEN} → ${STATUS_LABELS.IN_PROGRESS})`;
  }
  if (from === 'IN_PROGRESS' && to === 'DONE') return `${actor} concluiu a ordem`;
  if ((from === 'OPEN' || from === 'IN_PROGRESS') && to === 'CANCELLED') {
    return `${actor} cancelou a ordem`;
  }
  return null;
}

function describeKnown(event: WorkOrderEvent, actor: string): string | null {
  switch (event.type) {
    case 'CREATED':
      return `${actor} criou a ordem`;
    case 'STATUS_CHANGED':
      return describeStatus(actor, event.fromStatus, event.toStatus);
    case 'UPDATED': {
      const fields = event.details?.changes.map((change) => change.field) ?? [];
      if (fields.length === 0 || !fields.every(isKnownField)) return null;
      return fields.length === 1
        ? `${actor} alterou ${FIELD_NAMES[fields[0]].withArticle}`
        : `${actor} alterou ${joinList(fields.map((field) => FIELD_NAMES[field].bare))}`;
    }
    case 'ASSIGNED': {
      if (!event.details) return null;
      const { from, to } = event.details;
      const before = from ? ` (antes: ${from.name ?? 'usuário removido'})` : '';
      if (to) return `${actor} atribuiu a ordem a ${to.name ?? 'usuário removido'}${before}`;
      if (from) return `${actor} removeu o responsável${before}`;
      return null;
    }
    default:
      return null;
  }
}

export function describeEvent(event: WorkOrderEvent): string {
  // `actor` pode faltar num JSON fora do contrato; o `?.` protege a leitura em tempo de execução.
  const actor = (event as Partial<WorkOrderEvent>).actor?.name ?? 'alguém';
  return describeKnown(event, actor) ?? `Alteração registrada por ${actor}`;
}

export type ChangeLine = { label: string; from: string; to: string };

const CHANGE_LABELS = { title: 'Título', priority: 'Prioridade', dueDate: 'Prazo' } as const;

/**
 * Antes → depois dos campos editados que têm valor (título, prioridade e prazo), já formatados
 * como no detalhe. A descrição não tem linha: a API não expõe o texto.
 */
export function describeChanges(event: WorkOrderEvent): ChangeLine[] {
  if (event.type !== 'UPDATED' || !event.details) return [];
  return event.details.changes.flatMap((change): ChangeLine[] => {
    switch (change.field) {
      case 'title':
        return [{ label: CHANGE_LABELS.title, from: change.from, to: change.to }];
      case 'priority':
        return [
          {
            label: CHANGE_LABELS.priority,
            from: PRIORITY_LABELS[change.from],
            to: PRIORITY_LABELS[change.to],
          },
        ];
      case 'dueDate':
        return [
          {
            label: CHANGE_LABELS.dueDate,
            from: formatDateTime(change.from),
            to: formatDateTime(change.to),
          },
        ];
      default:
        return [];
    }
  });
}
