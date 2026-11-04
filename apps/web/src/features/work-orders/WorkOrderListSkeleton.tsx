import { Skeleton } from '../../components/Skeleton';

const ROWS = 6;

/** Mesmo formato da lista (tabela no desktop, cartões no celular), para a tela não pular. */
export function WorkOrderListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Carregando ordens…</span>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <div className="h-9 bg-surface-muted" />
        {Array.from({ length: ROWS }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[3fr_1fr_1fr_1.5fr_1.5fr] items-center gap-4 border-t border-border px-4 py-3.5"
          >
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <ul className="space-y-3 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="space-y-3 rounded-card border border-border bg-surface p-4">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </li>
        ))}
      </ul>
    </div>
  );
}
