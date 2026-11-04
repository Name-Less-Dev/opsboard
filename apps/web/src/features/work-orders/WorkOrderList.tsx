import { Link, useLocation } from 'react-router';
import { OverdueBadge, PriorityBadge, StatusBadge } from '../../components/Badge';
import { formatDateTime } from '../../lib/format';
import type { WorkOrder } from './labels';
import { isOverdue } from './overdue';

type Props = { orders: WorkOrder[]; now: Date };

function TitleLink({ order }: { order: WorkOrder }) {
  const location = useLocation();
  return (
    <Link
      to={`/orders/${order.id}`}
      // A página de detalhe usa isso para voltar à lista com os mesmos filtros.
      state={{ listSearch: location.search }}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {order.title}
    </Link>
  );
}

function Assignee({ order }: { order: WorkOrder }) {
  return order.assignee ? (
    <>{order.assignee.name}</>
  ) : (
    <span className="text-muted">Sem responsável</span>
  );
}

function DueDate({ order, now }: { order: WorkOrder; now: Date }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <time dateTime={order.dueDate} className="whitespace-nowrap">
        {formatDateTime(order.dueDate)}
      </time>
      {isOverdue(order, now) && <OverdueBadge />}
    </span>
  );
}

/** Tabela no desktop e cartões no celular; só um dos dois aparece (o outro é display: none). */
export function WorkOrderList({ orders, now }: Props) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Ordens de serviço</caption>
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Título
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Prioridade
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Responsável
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Prazo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="max-w-md px-4 py-3 break-words">
                  <TitleLink order={order} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={order.priority} />
                </td>
                <td className="px-4 py-3">
                  <Assignee order={order} />
                </td>
                <td className="px-4 py-3">
                  <DueDate order={order} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label="Ordens de serviço">
        {orders.map((order) => (
          <li key={order.id} className="rounded-card border border-border bg-surface p-4">
            <p className="break-words">
              <TitleLink order={order} />
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={order.status} />
              <PriorityBadge priority={order.priority} />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Responsável</dt>
              <dd className="min-w-0 break-words">
                <Assignee order={order} />
              </dd>
              <dt className="text-muted">Prazo</dt>
              <dd>
                <DueDate order={order} now={now} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
