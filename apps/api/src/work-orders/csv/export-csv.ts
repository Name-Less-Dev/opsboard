import { stringify } from 'csv-stringify/sync';
import { DateTime } from 'luxon';
import type { WorkOrderResponse } from '../work-order-select';
import { PRIORITY_LABELS, STATUS_LABELS } from './csv-labels';
import { neutralizeCell } from './neutralize-cell';

export const EXPORT_COLUMNS = [
  'id',
  'title',
  'description',
  'priority',
  'status',
  'dueDate',
  'assigneeName',
  'createdByName',
  'createdAt',
  'updatedAt',
] as const;

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/** Uma linha do CSV. Texto livre passa por `neutralizeCell`; o resto é gerado por nós. */
export function toExportRow(order: WorkOrderResponse): string[] {
  return [
    order.id,
    neutralizeCell(order.title),
    neutralizeCell(order.description),
    PRIORITY_LABELS[order.priority],
    STATUS_LABELS[order.status],
    order.dueDate.toISOString(),
    neutralizeCell(order.assignee?.name),
    neutralizeCell(order.createdBy.name),
    order.createdAt.toISOString(),
    order.updatedAt.toISOString(),
  ];
}

/**
 * CSV no formato que o Excel em português abre direto: BOM (senão os acentos quebram), `;` e
 * CRLF. O csv-stringify põe aspas só quando a célula tem separador, aspas ou quebra de linha.
 */
export function buildExportCsv(orders: readonly WorkOrderResponse[]): string {
  return stringify([[...EXPORT_COLUMNS], ...orders.map(toExportRow)], {
    bom: true,
    delimiter: ';',
    record_delimiter: 'windows',
  });
}

/** `opsboard-ordens-20261105-1430.csv`, no horário do fuso da aplicação. */
export function exportFilename(now: Date, timezone: string): string {
  const stamp = DateTime.fromJSDate(now, { zone: timezone }).toFormat('yyyyMMdd-HHmm');
  return `opsboard-ordens-${stamp}.csv`;
}
