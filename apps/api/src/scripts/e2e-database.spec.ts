import { DEFAULT_E2E_DATABASE_URL, e2eDatabaseName } from './e2e-database';

describe('e2eDatabaseName', () => {
  it.each([
    [DEFAULT_E2E_DATABASE_URL, 'opsboard_e2e'],
    ['postgres://u:p@db:5432/outro_e2e', 'outro_e2e'],
    ['postgresql://u:p@localhost:5432/opsboard_e2e?schema=public', 'opsboard_e2e'],
  ])('aceita %s', (url, name) => {
    expect(e2eDatabaseName(url)).toBe(name);
  });

  it.each([
    ['desenvolvimento', 'postgresql://u:p@localhost:5432/opsboard'],
    ['integração', 'postgresql://u:p@localhost:5432/opsboard_test'],
    ['sufixo no meio', 'postgresql://u:p@localhost:5432/opsboard_e2e_copia'],
    ['maiúsculas', 'postgresql://u:p@localhost:5432/OPSBOARD_E2E'],
    ['sem banco', 'postgresql://u:p@localhost:5432/'],
  ])('recusa o banco de %s', (_label, url) => {
    expect(() => e2eDatabaseName(url)).toThrow(/precisa terminar em _e2e/);
  });

  it.each([['não é URL'], [''], ['localhost:5432/opsboard_e2e']])(
    'recusa URL malformada: %j',
    (url) => {
      expect(() => e2eDatabaseName(url)).toThrow(/malformada|postgresql:\/\//);
    },
  );

  it('recusa outro protocolo', () => {
    expect(() => e2eDatabaseName('mysql://u:p@localhost/opsboard_e2e')).toThrow(/postgresql:\/\//);
  });

  it('a mensagem nunca mostra a senha', () => {
    let message = '';
    try {
      e2eDatabaseName('postgresql://u:segredo123@localhost/opsboard');
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/Recusado/);
    expect(message).not.toContain('segredo123');
  });
});
