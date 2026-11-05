import { assignedUserIds, mapEventDetails } from './event-details.mapper';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const GONE = '99999999-9999-4999-8999-999999999999';
const NAMES = new Map([
  [ANA, 'Ana Operadora'],
  [BRUNO, 'Bruno Operador'],
]);

describe('mapEventDetails', () => {
  // Formato real gravado pelo Dia 3 (WorkOrdersService.update): um objeto por campo alterado.
  it.each([
    [
      'UPDATED com um campo',
      { title: { from: 'Antigo', to: 'Novo' } },
      { changes: [{ field: 'title', from: 'Antigo', to: 'Novo' }] },
    ],
    [
      'UPDATED com vários campos, na ordem fixa título → descrição → prioridade → prazo',
      {
        dueDate: { from: '2026-11-01T12:00:00.000Z', to: '2026-11-02T12:00:00.000Z' },
        priority: { from: 'LOW', to: 'URGENT' },
        title: { from: 'A', to: 'B' },
      },
      {
        changes: [
          { field: 'title', from: 'A', to: 'B' },
          { field: 'priority', from: 'LOW', to: 'URGENT' },
          { field: 'dueDate', from: '2026-11-01T12:00:00.000Z', to: '2026-11-02T12:00:00.000Z' },
        ],
      },
    ],
    [
      'UPDATED de descrição: só o nome do campo, nunca o texto',
      { description: { from: 'texto antigo', to: null } },
      { changes: [{ field: 'description' }] },
    ],
  ])('%s', (_name, payload, expected) => {
    expect(mapEventDetails('UPDATED', payload, NAMES)).toEqual(expected);
  });

  it('a descrição não vaza nem dentro do JSON serializado', () => {
    const details = mapEventDetails(
      'UPDATED',
      { description: { from: 'segredo antigo', to: 'segredo novo' } },
      NAMES,
    );
    expect(JSON.stringify(details)).not.toMatch(/segredo/);
  });

  it.each([
    [
      'antes e depois',
      { from: ANA, to: BRUNO },
      {
        from: { id: ANA, name: 'Ana Operadora' },
        to: { id: BRUNO, name: 'Bruno Operador' },
      },
    ],
    [
      'antes nulo (primeira atribuição)',
      { from: null, to: ANA },
      {
        from: null,
        to: { id: ANA, name: 'Ana Operadora' },
      },
    ],
    [
      'depois nulo (responsável removido)',
      { from: BRUNO, to: null },
      {
        from: { id: BRUNO, name: 'Bruno Operador' },
        to: null,
      },
    ],
    [
      'usuário que não existe mais: nome null',
      { from: GONE, to: ANA },
      {
        from: { id: GONE, name: null },
        to: { id: ANA, name: 'Ana Operadora' },
      },
    ],
  ])('ASSIGNED com %s', (_name, payload, expected) => {
    expect(mapEventDetails('ASSIGNED', payload, NAMES)).toEqual(expected);
  });

  it.each([
    ['CREATED', { title: 'x', description: 'texto', assigneeId: ANA }],
    ['STATUS_CHANGED', {}],
  ] as const)('%s não tem details (o payload é ignorado)', (type, payload) => {
    expect(mapEventDetails(type, payload, NAMES)).toBeNull();
  });

  // Payload fora do formato: details null, nunca exceção (evento antigo não derruba a leitura).
  it.each([
    ['UPDATED vazio', 'UPDATED', {}],
    ['UPDATED com chave desconhecida', 'UPDATED', { color: { from: 'a', to: 'b' } }],
    [
      'UPDATED com campo conhecido e um desconhecido',
      'UPDATED',
      {
        title: { from: 'a', to: 'b' },
        extra: { from: 1, to: 2 },
      },
    ],
    ['UPDATED com valor de tipo errado', 'UPDATED', { title: { from: 1, to: 'b' } }],
    ['UPDATED com prioridade fora do enum', 'UPDATED', { priority: { from: 'LOW', to: 'MAX' } }],
    ['UPDATED com prazo que não é data', 'UPDATED', { dueDate: { from: 'ontem', to: 'hoje' } }],
    ['UPDATED com mudança sem "to"', 'UPDATED', { title: { from: 'a' } }],
    ['UPDATED com chave a mais na mudança', 'UPDATED', { title: { from: 'a', to: 'b', x: 1 } }],
    ['UPDATED com descrição de tipo errado', 'UPDATED', { description: { from: 1, to: null } }],
    ['UPDATED que é lista', 'UPDATED', [{ field: 'title' }]],
    ['UPDATED nulo', 'UPDATED', null],
    ['UPDATED texto', 'UPDATED', 'title'],
    ['ASSIGNED vazio', 'ASSIGNED', {}],
    ['ASSIGNED só com "to"', 'ASSIGNED', { to: ANA }],
    ['ASSIGNED com chave desconhecida', 'ASSIGNED', { from: null, to: ANA, by: BRUNO }],
    ['ASSIGNED com id numérico', 'ASSIGNED', { from: 123, to: ANA }],
    ['ASSIGNED com objeto no lugar do id', 'ASSIGNED', { from: null, to: { id: ANA } }],
    ['ASSIGNED nulo', 'ASSIGNED', null],
  ] as const)('%s → null, sem lançar', (_name, type, payload) => {
    expect(() => mapEventDetails(type, payload, NAMES)).not.toThrow();
    expect(mapEventDetails(type, payload, NAMES)).toBeNull();
  });
});

describe('assignedUserIds', () => {
  it('junta os ids das atribuições, sem repetir e sem nulos', () => {
    const events = [
      { type: 'ASSIGNED', payload: { from: null, to: ANA } },
      { type: 'ASSIGNED', payload: { from: ANA, to: BRUNO } },
      { type: 'UPDATED', payload: { title: { from: 'a', to: 'b' } } },
      { type: 'CREATED', payload: { assigneeId: GONE } },
      { type: 'ASSIGNED', payload: { from: 123, to: GONE } },
    ] as const;
    expect(assignedUserIds(events)).toEqual([ANA, BRUNO]);
  });

  it('lista vazia → nenhum id (o service nem consulta)', () => {
    expect(assignedUserIds([])).toEqual([]);
  });
});
