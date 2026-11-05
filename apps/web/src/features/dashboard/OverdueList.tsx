import { Link } from 'react-router';
import { PriorityBadge } from '../../components/Badge';
import { formatDateTime } from '../../lib/format';
import type { WorkOrder } from '../work-orders/labels';
import { formatOverdueBy } from './overdue-by';

type Props = {
  /** Na ordem recebida da API (prazo mais antigo primeiro); o componente não reordena. */
  orders: WorkOrder[];
  /** `generatedAt` da resposta: o "agora" do cálculo de atraso. */
  now: Date;
};

function TitleLink({ order }: { order: WorkOrder }) {
  return (
    <Link
      to={`/orders/${order.id}`}
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

function DueDate({ order }: { order: WorkOrder }) {
  return (
    <time dateTime={order.dueDate} className="whitespace-nowrap">
      {formatDateTime(order.dueDate)}
    </time>
  );
}

function OverdueBy({ order, now }: { order: WorkOrder; now: Date }) {
  return (
    <span className="font-medium whitespace-nowrap text-danger">
      {formatOverdueBy(order.dueDate, now)}
    </span>
  );
}

/** Tabela no desktop e cartões no celular, como a lista de ordens. */
export function OverdueList({ orders, now }: Props) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Ordens atrasadas, prazo mais antigo primeiro</caption>
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Título
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
              <th scope="col" className="px-4 py-2 font-medium">
                Atraso
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
                  <PriorityBadge priority={order.priority} />
                </td>
                <td className="px-4 py-3">
                  <Assignee order={order} />
                </td>
                <td className="px-4 py-3">
                  <DueDate order={order} />
                </td>
                <td className="px-4 py-3">
                  <OverdueBy order={order} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="space-y-3 md:hidden" aria-label="Ordens atrasadas, prazo mais antigo primeiro">
        {orders.map((order) => (
          <li key={order.id} className="rounded-card border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 break-words">
                <TitleLink order={order} />
              </p>
              <PriorityBadge priority={order.priority} />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Responsável</dt>
              <dd className="min-w-0 break-words">
                <Assignee order={order} />
              </dd>
              <dt className="text-muted">Prazo</dt>
              <dd>
                <DueDate order={order} />
              </dd>
              <dt className="text-muted">Atraso</dt>
              <dd>
                <OverdueBy order={order} now={now} />
              </dd>
            </dl>
          </li>
        ))}
      </ol>
    </>
  );
}
