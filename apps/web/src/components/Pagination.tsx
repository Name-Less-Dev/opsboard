import { formatCount, formatNumber } from '../lib/format';
import { Button } from './Button';

/**
 * "Página X de Y", total de resultados e botões de navegação. Some quando não há resultado.
 * Os botões ficam desabilitados nas pontas, em vez de sumir, para não mudarem de lugar.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  disabled = false,
  label = 'Paginação',
  itemNames = ['resultado', 'resultados'],
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Nome do `<nav>`: com mais de uma paginação na tela, cada uma precisa do seu. */
  label?: string;
  /** Singular e plural do que é contado ("resultado", "evento"). */
  itemNames?: [string, string];
}) {
  if (totalPages === 0) return null;

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav
      aria-label={label}
      className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-sm text-muted">
        Página <span className="font-medium text-text">{formatNumber(page)}</span> de{' '}
        <span className="font-medium text-text">{formatNumber(totalPages)}</span>
        {' · '}
        {formatCount(total, ...itemNames)}
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled || isFirst} onClick={() => onPageChange(1)}>
          Primeira
        </Button>
        <Button size="sm" disabled={disabled || isFirst} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" disabled={disabled || isLast} onClick={() => onPageChange(page + 1)}>
          Próxima
        </Button>
        <Button size="sm" disabled={disabled || isLast} onClick={() => onPageChange(totalPages)}>
          Última
        </Button>
      </div>
    </nav>
  );
}
