import { describe, expect, it } from 'vitest';
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS } from './labels';

describe('rótulos', () => {
  it('status na ordem do fluxo, em português', () => {
    expect(STATUSES.map((s) => STATUS_LABELS[s])).toEqual([
      'Aberta',
      'Em andamento',
      'Concluída',
      'Cancelada',
    ]);
  });

  it('prioridades por gravidade, em português', () => {
    expect(PRIORITIES.map((p) => PRIORITY_LABELS[p])).toEqual([
      'Baixa',
      'Média',
      'Alta',
      'Urgente',
    ]);
  });
});
