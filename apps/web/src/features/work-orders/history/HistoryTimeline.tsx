import { HistoryItem } from './HistoryItem';
import type { WorkOrderEvent } from './history-types';

/** Lista ordenada na ordem recebida da API (mais recente primeiro); não reordena. */
export function HistoryTimeline({ events }: { events: WorkOrderEvent[] }) {
  return (
    <ol aria-label="Histórico da ordem">
      {events.map((event) => (
        <HistoryItem key={event.id} event={event} />
      ))}
    </ol>
  );
}
