// Guarda do banco dos testes e2e. O reset apaga tudo, então só roda num banco cujo nome termina
// em `_e2e`: nunca no de desenvolvimento (`opsboard`) nem no de integração (`opsboard_test`).
// A mensagem de erro mostra só o nome do banco, nunca a URL (que tem a senha).

export const DEFAULT_E2E_DATABASE_URL =
  'postgresql://opsboard:opsboard@localhost:5432/opsboard_e2e';

/** Devolve o nome do banco se a URL for de um banco e2e; senão lança com o motivo. */
export function e2eDatabaseName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'E2E_DATABASE_URL malformada: use postgresql://usuario:senha@host:porta/banco_e2e',
    );
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('E2E_DATABASE_URL precisa ser uma URL postgresql://');
  }
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^[a-z0-9_]+_e2e$/.test(name)) {
    throw new Error(
      `Recusado: o banco do e2e precisa terminar em _e2e (veio "${name || '(vazio)'}"). ` +
        'O reset apaga todos os dados, então nunca roda no banco de desenvolvimento nem no de testes.',
    );
  }
  return name;
}
