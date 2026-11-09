import { buildDemoOrders, DEMO_USERS } from './demo-data';
import { assertDemoResetAllowed, confirmationMatches, describeDatabaseTarget } from './demo-guard';

const NOW = new Date('2026-11-09T15:00:00.000Z');

describe('buildDemoOrders', () => {
  const orders = buildDemoOrders(NOW);

  it('é determinística: o mesmo "agora" gera exatamente os mesmos dados', () => {
    expect(buildDemoOrders(new Date(NOW))).toEqual(orders);
  });

  it('tem 30 ordens com títulos únicos', () => {
    expect(orders).toHaveLength(30);
    expect(new Set(orders.map((order) => order.title)).size).toBe(30);
  });

  it('cobre todos os status e prioridades, com e sem responsável', () => {
    expect(new Set(orders.map((order) => order.status))).toEqual(
      new Set(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
    );
    expect(new Set(orders.map((order) => order.priority))).toEqual(
      new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    );
    expect(orders.some((order) => order.assignee === null)).toBe(true);
    expect(orders.some((order) => order.assignee !== null)).toBe(true);
  });

  it('tem pelo menos 5 atrasadas (ativas com prazo vencido)', () => {
    const overdue = orders.filter(
      (order) => (order.status === 'OPEN' || order.status === 'IN_PROGRESS') && order.dueDate < NOW,
    );
    expect(overdue.length).toBeGreaterThanOrEqual(5);
  });

  it('histórico coerente: começa no CREATED, em ordem, no passado, e termina no estado atual', () => {
    for (const order of orders) {
      const [first, ...rest] = order.events;
      expect(first.type).toBe('CREATED');
      expect(first.at).toEqual(order.createdAt);
      const times = order.events.map((event) => event.at.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(Math.max(...times)).toBeLessThan(NOW.getTime());
      expect(order.updatedAt).toEqual(order.events[order.events.length - 1].at);

      const statusChanges = rest.filter((event) => event.type === 'STATUS_CHANGED');
      const lastStatus = statusChanges.at(-1);
      expect(lastStatus ? lastStatus.to : 'OPEN').toBe(order.status);

      const assignments = rest.filter((event) => event.type === 'ASSIGNED');
      expect(assignments.at(-1)?.to ?? null).toBe(order.assignee);

      const edits = rest.filter((event) => event.type === 'UPDATED');
      const lastEdit = edits.at(-1);
      if (lastEdit) expect(lastEdit.title.to).toBe(order.title);
      else if (first.type === 'CREATED') expect(first.snapshot.title).toBe(order.title);
    }
  });

  it('usuários fictícios em domínio reservado, um supervisor e dois operadores', () => {
    const users = Object.values(DEMO_USERS);
    expect(users.every((user) => user.email.endsWith('@example.com'))).toBe(true);
    expect(users.filter((user) => user.role === 'SUPERVISOR')).toHaveLength(1);
    expect(users.filter((user) => user.role === 'OPERATOR')).toHaveLength(2);
  });
});

describe('guard do seed:demo', () => {
  it('só aceita ALLOW_DEMO_RESET=true, exatamente', () => {
    expect(() => assertDemoResetAllowed({ ALLOW_DEMO_RESET: 'true' })).not.toThrow();
    for (const value of [undefined, '', '1', 'TRUE', 'yes', ' true']) {
      expect(() => assertDemoResetAllowed({ ALLOW_DEMO_RESET: value })).toThrow(
        /ALLOW_DEMO_RESET=true/,
      );
    }
  });

  it('descreve o alvo sem usuário nem senha', () => {
    const target = describeDatabaseTarget(
      'postgresql://dono:senha-secreta@ep-demo-123.sa-east-1.aws.neon.tech/opsboard?sslmode=require',
    );
    expect(target).toEqual({ host: 'ep-demo-123.sa-east-1.aws.neon.tech', database: 'opsboard' });
    expect(JSON.stringify(target)).not.toMatch(/senha-secreta|dono/);
  });

  it.each([[undefined], [''], ['não é url'], ['mysql://u:p@h/db']])(
    'recusa URL ausente ou inválida: %j',
    (url) => {
      expect(() => describeDatabaseTarget(url)).toThrow(/DATABASE_URL/);
    },
  );

  it('a confirmação precisa ser o host digitado', () => {
    const target = { host: 'db.example.com', database: 'opsboard' };
    expect(confirmationMatches('db.example.com', target)).toBe(true);
    expect(confirmationMatches('  db.example.com\n', target)).toBe(true);
    expect(confirmationMatches('sim', target)).toBe(false);
    expect(confirmationMatches('opsboard', target)).toBe(false);
    expect(confirmationMatches('', target)).toBe(false);
  });
});
