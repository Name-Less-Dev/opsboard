import { IANAZone } from 'luxon';

// Configuração tipada e validada. Classe abstrata como token de injeção (mesmo padrão do Clock):
// quem precisa de configuração recebe `AppConfig`, nunca lê `process.env` direto.
export abstract class AppConfig {
  abstract readonly nodeEnv: 'development' | 'production' | 'test';
  abstract readonly port: number;
  abstract readonly databaseUrl: string;
  abstract readonly jwtSecret: string;
  abstract readonly jwtExpiresIn: string;
  abstract readonly corsOrigins: string[];
  abstract readonly trustProxy: number;
  abstract readonly loginRateLimit: number;
  abstract readonly loginRateTtlSeconds: number;
  abstract readonly swaggerEnabled: boolean;
  /** Fuso IANA usado no CSV: prazo só com data e horário do nome do arquivo exportado. */
  abstract readonly appTimezone: string;
  abstract readonly exportMaxRows: number;
  abstract readonly importMaxRows: number;
}

// O mesmo valor do .env.example (um teste confere): em produção ele é recusado.
export const EXAMPLE_JWT_SECRET = 'dev-only-troque-este-segredo-de-exemplo-local';
export const MIN_JWT_SECRET_LENGTH = 32;

type RawEnv = Record<string, string | undefined>;

// Junta todos os problemas numa mensagem só, para corrigir tudo de uma vez.
// Nunca inclui os valores: o erro de boot vai para o log, e um deles pode ser o segredo.
export class InvalidEnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuração inválida:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'InvalidEnvError';
  }
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

export function loadAppConfig(env: RawEnv): AppConfig {
  const problems: string[] = [];

  const integer = (name: string, fallback: number, min: number): number => {
    const value = env[name];
    if (!present(value)) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
      problems.push(`${name}: precisa ser um inteiro maior ou igual a ${min}`);
    }
    return parsed;
  };

  const nodeEnv = present(env.NODE_ENV) ? env.NODE_ENV : 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'production' && nodeEnv !== 'test') {
    problems.push('NODE_ENV: use development, production ou test');
  }
  const production = nodeEnv === 'production';

  const databaseUrl = env.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:\/\/.+/.test(databaseUrl)) {
    problems.push(
      'DATABASE_URL: obrigatória, no formato postgresql://usuario:senha@host:porta/banco',
    );
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET: obrigatório, com pelo menos ${MIN_JWT_SECRET_LENGTH} caracteres (ex.: openssl rand -base64 32)`,
    );
  } else if (production && jwtSecret === EXAMPLE_JWT_SECRET) {
    problems.push('JWT_SECRET: o valor de exemplo do .env.example não pode ser usado em produção');
  }

  // Formato aceito pelo jsonwebtoken: número de segundos ou número com unidade (30m, 1h, 7d).
  const jwtExpiresIn = env.JWT_EXPIRES_IN ?? '';
  if (!/^\d+[smhd]?$/.test(jwtExpiresIn)) {
    problems.push('JWT_EXPIRES_IN: obrigatório, em segundos ou com unidade s, m, h ou d (ex.: 1h)');
  }

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  for (const origin of corsOrigins) {
    // A origem precisa bater exatamente com a do navegador: sem caminho nem barra no fim.
    if (!isOrigin(origin)) {
      problems.push(`CORS_ORIGINS: "${origin}" não é uma origem (ex.: https://ops.example.com)`);
    }
  }

  const swaggerRaw = env.SWAGGER_ENABLED;
  if (present(swaggerRaw) && swaggerRaw !== 'true' && swaggerRaw !== 'false') {
    problems.push('SWAGGER_ENABLED: use true ou false');
  }

  const appTimezone = present(env.APP_TIMEZONE) ? env.APP_TIMEZONE.trim() : 'America/Sao_Paulo';
  // O Luxon também aceita um offset solto ("-03:00"), que ignora o horário de verão: exige nome.
  if (!/^[A-Za-z]/.test(appTimezone) || !IANAZone.isValidZone(appTimezone)) {
    problems.push('APP_TIMEZONE: use um fuso IANA (ex.: America/Sao_Paulo)');
  }

  const config: AppConfig = {
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    port: integer('PORT', 3000, 1),
    databaseUrl,
    jwtSecret,
    jwtExpiresIn,
    corsOrigins,
    trustProxy: integer('TRUST_PROXY', 0, 0),
    loginRateLimit: integer('LOGIN_RATE_LIMIT', 5, 1),
    loginRateTtlSeconds: integer('LOGIN_RATE_TTL', 60, 1),
    // Em produção o Swagger só sobe se pedido; fora dela, sobe por padrão.
    swaggerEnabled: present(swaggerRaw) ? swaggerRaw === 'true' : !production,
    appTimezone,
    exportMaxRows: integer('EXPORT_MAX_ROWS', 10000, 1),
    importMaxRows: integer('IMPORT_MAX_ROWS', 500, 1),
  };

  if (problems.length > 0) throw new InvalidEnvError(problems);
  return config;
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}
