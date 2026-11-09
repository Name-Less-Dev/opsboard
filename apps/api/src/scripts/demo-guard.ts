// Proteção do `seed:demo`, que APAGA as tabelas do OpsBoard no banco apontado. Duas travas:
// a variável ALLOW_DEMO_RESET=true e a confirmação digitada do host do banco.

export type DemoTarget = { host: string; database: string };

/** Lança se a variável não for exatamente "true" (nada de "1", "yes" ou maiúsculas). */
export function assertDemoResetAllowed(env: Record<string, string | undefined>): void {
  if (env.ALLOW_DEMO_RESET !== 'true') {
    throw new Error(
      'Recusado: o seed:demo apaga todos os dados do OpsBoard no banco apontado. ' +
        'Defina ALLOW_DEMO_RESET=true para continuar.',
    );
  }
}

/** Host e banco da URL, para mostrar na confirmação. Nunca devolve usuário nem senha. */
export function describeDatabaseTarget(url: string | undefined): DemoTarget {
  let parsed: URL;
  try {
    parsed = new URL(url ?? '');
  } catch {
    throw new Error('DATABASE_URL ausente ou malformada');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL precisa ser uma URL postgresql://');
  }
  return { host: parsed.hostname, database: decodeURIComponent(parsed.pathname.slice(1)) };
}

/** A pessoa precisa digitar o host exatamente (só espaços nas pontas são ignorados). */
export function confirmationMatches(typed: string, target: DemoTarget): boolean {
  return typed.trim() === target.host;
}
