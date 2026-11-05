import { Skeleton } from '../../components/Skeleton';

/** Mesmo formato do painel (cards, resumo e lista), para a tela não pular quando os dados chegam. */
export function DashboardSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Carregando painel…</span>
      <div className="space-y-3">
        <Skeleton className="h-6 w-44" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className={`space-y-3 rounded-card border border-border bg-surface p-4 ${
                index === 0 ? 'col-span-2 lg:col-span-1' : ''
              }`}
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-card border border-border bg-surface p-4">
        <Skeleton className="h-6 w-28" />
        <div className="flex gap-8">
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-12 w-28" />
        </div>
        <Skeleton className="h-5 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
