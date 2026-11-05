import type { ReactNode } from 'react';
import { formatDateTime } from '../../../lib/format';
import { describeChanges, describeEvent } from './describe-event';
import type { WorkOrderEvent } from './history-types';

// Ícones decorativos (aria-hidden): o significado está sempre no texto da frase.
const ICON_PATHS: Record<string, string> = {
  CREATED: 'M10 4v12M4 10h12',
  STATUS_CHANGED: 'M4 10h11m-4-4 4 4-4 4',
  UPDATED: 'm5 15 1-4 7-7 3 3-7 7-4 1Z',
  ASSIGNED: 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 7a6 6 0 0 1 12 0',
};
const FALLBACK_ICON = 'M10 9v.01M10 10v.01';

/** Destaca o nome do ator dentro da frase pronta de `describeEvent`. */
function withActorHighlighted(sentence: string, actor: string | undefined): ReactNode {
  const index = actor ? sentence.indexOf(actor) : -1;
  if (!actor || index === -1) return sentence;
  return (
    <>
      {sentence.slice(0, index)}
      <strong className="font-semibold">{actor}</strong>
      {sentence.slice(index + actor.length)}
    </>
  );
}

export function HistoryItem({ event }: { event: WorkOrderEvent }) {
  const changes = describeChanges(event);
  // `actor` pode faltar num JSON fora do contrato (ver describeEvent).
  const actorName = (event as Partial<WorkOrderEvent>).actor?.name;

  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0">
      {/* Linha vertical que liga os itens; a do último some. */}
      <span
        aria-hidden="true"
        className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border group-last:hidden"
      />
      <span
        aria-hidden="true"
        className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-control-border bg-surface text-muted"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={ICON_PATHS[event.type] ?? FALLBACK_ICON} />
        </svg>
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm break-words">
          {withActorHighlighted(describeEvent(event), actorName)}
        </p>
        {changes.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {changes.map((change) => (
              <li key={change.label} className="break-words">
                {change.label}: {change.from} → {change.to}
              </li>
            ))}
          </ul>
        )}
        <time dateTime={event.createdAt} className="mt-1 block text-xs text-muted">
          {formatDateTime(event.createdAt)}
        </time>
      </div>
    </li>
  );
}
