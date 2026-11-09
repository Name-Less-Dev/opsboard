import type { WorkOrderPriority, WorkOrderStatus } from '../generated/prisma/enums';

// Dados da demonstração pública, gerados por função pura: mesma entrada ("agora"), mesma saída.
// Nada aleatório; só as datas andam com o relógio, para o painel sempre ter atrasadas.
// Tudo fictício: nomes inventados e e-mails no domínio reservado example.com.

export type DemoUserKey = 'supervisor' | 'operator' | 'otherOperator';

/** Senha das contas de demonstração, documentada no README (é pública de propósito). */
export const DEMO_PASSWORD = 'opsboard-demo';

export const DEMO_USERS: Record<
  DemoUserKey,
  { name: string; email: string; role: 'SUPERVISOR' | 'OPERATOR' }
> = {
  supervisor: { name: 'Carla Supervisora', email: 'supervisora@example.com', role: 'SUPERVISOR' },
  operator: { name: 'Ana Operadora', email: 'ana@example.com', role: 'OPERATOR' },
  otherOperator: { name: 'Bruno Operador', email: 'bruno@example.com', role: 'OPERATOR' },
};

export type DemoEvent =
  | { type: 'CREATED'; actor: DemoUserKey; at: Date; snapshot: DemoSnapshot }
  | { type: 'ASSIGNED'; actor: DemoUserKey; at: Date; from: DemoUserKey | null; to: DemoUserKey }
  | { type: 'UPDATED'; actor: DemoUserKey; at: Date; title: { from: string; to: string } }
  | {
      type: 'STATUS_CHANGED';
      actor: DemoUserKey;
      at: Date;
      from: WorkOrderStatus;
      to: WorkOrderStatus;
    };

/** Valores da ordem no momento da criação (o payload do CREATED, como a API grava). */
export type DemoSnapshot = {
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  dueDate: Date;
};

export type DemoOrder = {
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assignee: DemoUserKey | null;
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
  events: DemoEvent[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const STATUSES: WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const PRIORITIES: WorkOrderPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const ASSIGNEES: (DemoUserKey | null)[] = ['operator', 'otherOperator', null];

// [título, descrição]. 30 ordens de manutenção predial, fictícias.
const ORDERS: [string, string | null][] = [
  [
    'Trocar filtro do ar-condicionado da recepção',
    'Filtro saturado; equipe relatou cheiro de mofo.',
  ],
  ['Vazamento na pia da copa', 'Água acumulando embaixo do gabinete.'],
  ['Revisar extintores do 2º andar', null],
  ['Lâmpada queimada no corredor B', null],
  ['Porta da sala de reunião não fecha', 'A fechadura trava no meio do curso.'],
  ['Limpar calhas do galpão', 'Antes do período de chuvas.'],
  ['Impressora do financeiro sem rede', null],
  ['Ruído no elevador social', 'Barulho metálico ao parar no 3º andar.'],
  ['Pintar faixa do estacionamento', null],
  ['Trocar fechadura do almoxarifado', 'Chave reserva perdida.'],
  ['Verificar nobreak do servidor', 'Bateria apitando desde segunda.'],
  ['Consertar cadeira da recepção', null],
  ['Desentupir ralo do vestiário', null],
  ['Instalar suporte de TV na sala 4', 'Suporte já comprado, falta a instalação.'],
  ['Trocar vidro trincado da janela 12', null],
  ['Revisar quadro elétrico do térreo', 'Disjuntor desarmando à tarde.'],
  ['Repor sabonete dos banheiros', null],
  ['Calibrar balança da expedição', 'Diferença de 200 g na última conferência.'],
  ['Consertar torneira do jardim', null],
  ['Dedetização trimestral', 'Agendar com o fornecedor do contrato.'],
  ['Trocar carpete da sala de treinamento', null],
  ['Ajustar mola da porta corta-fogo', null],
  ['Limpar caixa d’água', 'Limpeza semestral obrigatória.'],
  ['Trocar bateria do alarme', null],
  ['Organizar arquivo morto', null],
  ['Consertar persiana da diretoria', null],
  ['Revisar iluminação de emergência', 'Teste mensal das luminárias.'],
  ['Trocar tomada da copa', 'Tomada solta da parede.'],
  ['Manutenção do portão eletrônico', null],
  ['Reparar goteira no telhado do galpão', 'Aparece em dias de chuva forte.'],
];

/** Gera os dados da demonstração para um instante "agora". Função pura e determinística. */
export function buildDemoOrders(now: Date): DemoOrder[] {
  const base = now.getTime();
  return ORDERS.map(([title, description], index) => {
    const status = STATUSES[index % STATUSES.length];
    const priority = PRIORITIES[Math.floor(index / STATUSES.length) % PRIORITIES.length];
    const assignee = ASSIGNEES[index % ASSIGNEES.length];
    // 1 em cada 3 com prazo vencido; nas ativas, isso é "atrasada".
    const dueInDays = index % 3 === 0 ? -(1 + (index % 6)) : 2 + (index % 14);
    const dueDate = new Date(base + dueInDays * DAY_MS);
    // Criadas ao longo dos últimos ~40 dias; os passos seguintes nas horas e dias seguintes.
    const createdAt = new Date(base - (40 - index) * DAY_MS);
    const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR_MS);
    const worker: DemoUserKey = assignee ?? 'supervisor';
    const edited = index % 5 === 1;
    const createdTitle = edited ? `${title} (rascunho)` : title;

    const events: DemoEvent[] = [
      {
        type: 'CREATED',
        actor: 'supervisor',
        at: createdAt,
        snapshot: { title: createdTitle, description, priority, dueDate },
      },
    ];
    if (assignee) {
      events.push({ type: 'ASSIGNED', actor: 'supervisor', at: at(1), from: null, to: assignee });
    }
    if (edited) {
      events.push({
        type: 'UPDATED',
        actor: 'supervisor',
        at: at(2),
        title: { from: createdTitle, to: title },
      });
    }
    const change = (actor: DemoUserKey, from: WorkOrderStatus, to: WorkOrderStatus, h: number) =>
      events.push({ type: 'STATUS_CHANGED', actor, at: at(h), from, to });
    if (status === 'IN_PROGRESS' || status === 'DONE') change(worker, 'OPEN', 'IN_PROGRESS', 24);
    if (status === 'DONE') change(worker, 'IN_PROGRESS', 'DONE', 48);
    if (status === 'CANCELLED') change('supervisor', 'OPEN', 'CANCELLED', 24);

    return {
      title,
      description,
      priority,
      status,
      assignee,
      dueDate,
      createdAt,
      updatedAt: events[events.length - 1].at,
      events,
    };
  });
}
