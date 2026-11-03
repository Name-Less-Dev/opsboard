import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLE_JWT_SECRET, InvalidEnvError, loadAppConfig } from './app-config';

const SECRET = 'a'.repeat(32);
const VALID = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/opsboard',
  JWT_SECRET: SECRET,
  JWT_EXPIRES_IN: '1h',
};

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    loadAppConfig(env);
  } catch (error) {
    if (error instanceof InvalidEnvError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadAppConfig', () => {
  it('mínimo válido: padrões para o resto', () => {
    expect(loadAppConfig(VALID)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: VALID.DATABASE_URL,
      jwtSecret: SECRET,
      jwtExpiresIn: '1h',
      corsOrigins: [],
      trustProxy: 0,
      loginRateLimit: 5,
      loginRateTtlSeconds: 60,
      swaggerEnabled: true,
    });
  });

  it('lê e converte todas as variáveis', () => {
    const config = loadAppConfig({
      ...VALID,
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: ' https://ops.example.com ,http://localhost:5173',
      TRUST_PROXY: '1',
      LOGIN_RATE_LIMIT: '10',
      LOGIN_RATE_TTL: '120',
      SWAGGER_ENABLED: 'true',
    });
    expect(config).toMatchObject({
      nodeEnv: 'production',
      port: 8080,
      corsOrigins: ['https://ops.example.com', 'http://localhost:5173'],
      trustProxy: 1,
      loginRateLimit: 10,
      loginRateTtlSeconds: 120,
      swaggerEnabled: true,
    });
  });

  describe('JWT_SECRET', () => {
    it.each([
      ['ausente', undefined],
      ['vazio', ''],
      ['com 31 caracteres', 'a'.repeat(31)],
    ])('%s é recusado', (_name, value) => {
      expect(problemsOf({ ...VALID, JWT_SECRET: value })).toEqual([
        expect.stringMatching(/^JWT_SECRET: .*32 caracteres/),
      ]);
    });

    it('32 caracteres é aceito', () => {
      expect(problemsOf({ ...VALID, JWT_SECRET: 'b'.repeat(32) })).toEqual([]);
    });

    it('o segredo de exemplo é recusado em produção', () => {
      expect(
        problemsOf({ ...VALID, NODE_ENV: 'production', JWT_SECRET: EXAMPLE_JWT_SECRET }),
      ).toEqual([expect.stringMatching(/^JWT_SECRET: o valor de exemplo/)]);
    });

    it('o segredo de exemplo é aceito fora de produção (desenvolvimento local)', () => {
      expect(problemsOf({ ...VALID, JWT_SECRET: EXAMPLE_JWT_SECRET })).toEqual([]);
    });

    it('o segredo de exemplo é o mesmo do .env.example', () => {
      const example = readFileSync(join(__dirname, '../../../../.env.example'), 'utf8');
      expect(example).toContain(`\nJWT_SECRET=${EXAMPLE_JWT_SECRET}\n`);
    });

    it('a mensagem de erro nunca mostra o valor', () => {
      const tooShort = 'segredo-curto-xyz';
      expect(() => loadAppConfig({ ...VALID, JWT_SECRET: tooShort })).toThrow(InvalidEnvError);
      expect(problemsOf({ ...VALID, JWT_SECRET: tooShort }).join()).not.toContain(tooShort);
    });
  });

  it.each([
    ['DATABASE_URL ausente', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['DATABASE_URL de outro banco', { DATABASE_URL: 'mysql://u:p@h/db' }, 'DATABASE_URL'],
    ['JWT_EXPIRES_IN ausente', { JWT_EXPIRES_IN: undefined }, 'JWT_EXPIRES_IN'],
    ['JWT_EXPIRES_IN sem formato', { JWT_EXPIRES_IN: 'uma hora' }, 'JWT_EXPIRES_IN'],
    ['NODE_ENV desconhecido', { NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['PORT não numérica', { PORT: 'abc' }, 'PORT'],
    ['PORT zero', { PORT: '0' }, 'PORT'],
    ['TRUST_PROXY negativo', { TRUST_PROXY: '-1' }, 'TRUST_PROXY'],
    ['TRUST_PROXY como true', { TRUST_PROXY: 'true' }, 'TRUST_PROXY'],
    ['LOGIN_RATE_LIMIT zero', { LOGIN_RATE_LIMIT: '0' }, 'LOGIN_RATE_LIMIT'],
    ['LOGIN_RATE_TTL fracionado', { LOGIN_RATE_TTL: '1.5' }, 'LOGIN_RATE_TTL'],
    ['SWAGGER_ENABLED como 1', { SWAGGER_ENABLED: '1' }, 'SWAGGER_ENABLED'],
    ['origem com barra no fim', { CORS_ORIGINS: 'https://ops.example.com/' }, 'CORS_ORIGINS'],
    ['origem com caminho', { CORS_ORIGINS: 'https://ops.example.com/app' }, 'CORS_ORIGINS'],
    ['origem sem protocolo', { CORS_ORIGINS: 'ops.example.com' }, 'CORS_ORIGINS'],
  ])('%s é recusado', (_name, override, variable) => {
    expect(problemsOf({ ...VALID, ...override })).toEqual([
      expect.stringMatching(new RegExp(`^${variable}: `)),
    ]);
  });

  it('lista todos os problemas de uma vez', () => {
    expect(problemsOf({ PORT: 'x' }).map((problem) => problem.split(':')[0])).toEqual([
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_EXPIRES_IN',
      'PORT',
    ]);
  });

  describe('SWAGGER_ENABLED', () => {
    it('em produção, desligado por padrão', () => {
      expect(loadAppConfig({ ...VALID, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    });

    it('em produção, ligado só se pedido', () => {
      expect(
        loadAppConfig({ ...VALID, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled,
      ).toBe(true);
    });

    it('fora de produção, pode ser desligado', () => {
      expect(loadAppConfig({ ...VALID, SWAGGER_ENABLED: 'false' }).swaggerEnabled).toBe(false);
    });
  });
});
