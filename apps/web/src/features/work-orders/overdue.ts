import type { WorkOrder } from './labels';

// Regra DUPLICADA DE PROPÓSITO: a lista da API não traz o campo "atrasada", e o selo é só
// exibição. A fonte da verdade é o back (`overdueWhere` em apps/api/src/work-orders/
// work-order-query.ts), que é quem filtra `overdue=true` e conta no painel. Se a regra mudar
// lá, mude aqui e nos testes com os mesmos casos de borda.
//
// Atrasada = prazo estritamente antes de `now` E status ativo. Prazo igual a `now` não conta.
export function isOverdue(order: Pick<WorkOrder, 'status' | 'dueDate'>, now: Date): boolean {
  const active = order.status === 'OPEN' || order.status === 'IN_PROGRESS';
  return active && new Date(order.dueDate).getTime() < now.getTime();
}
