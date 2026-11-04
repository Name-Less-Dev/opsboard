import type { ReactNode } from 'react';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../features/work-orders/labels';

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-tone-neutral-bg text-tone-neutral-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
  warning: 'bg-tone-warning-bg text-tone-warning-fg',
  success: 'bg-tone-success-bg text-tone-success-fg',
  danger: 'bg-tone-danger-bg text-tone-danger-fg',
};

// A cor reforça, mas o texto sempre diz o valor: nada depende só da cor.
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<WorkOrderStatus, Tone> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  DONE: 'success',
  CANCELLED: 'neutral',
};

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const PRIORITY_TONES: Record<WorkOrderPriority, Tone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  return <Badge tone={PRIORITY_TONES[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function OverdueBadge() {
  return (
    <Badge tone="danger">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3" fill="currentColor">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4v4.6l3 1.8-1 1.7-4-2.4V6h2Z" />
      </svg>
      Atrasada
    </Badge>
  );
}
