import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { InvalidEnvError } from './../src/config/app-config';
import { errorCode } from './error-code';
import { createTestApp, operator } from './test-app';

// Sobe uma aplicação com variáveis próprias e devolve o ambiente ao que era depois.
async function appWith(env: Record<string, string>): Promise<INestApplication<App>> {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    return await createTestApp();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const wrongLogin = (app: INestApplication<App>, forwardedFor?: string) => {
  const req = request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: operator.email, password: 'errada' });
  return forwardedFor ? req.set('X-Forwarded-For', forwardedFor) : req;
};

describe('Segurança HTTP (e2e)', () => {
  it('variável inválida impede a aplicação de subir, sem mostrar o valor', async () => {
    const error = await appWith({ JWT_SECRET: 'curto-demais', TRUST_PROXY: 'sim' }).then(
      () => new Error('a aplicação subiu'),
      (rejection: unknown) => rejection,
    );
    expect(error).toBeInstanceOf(InvalidEnvError);
    const { message } = error as InvalidEnvError;
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).toMatch(/TRUST_PROXY/);
    expect(message).not.toContain('curto-demais');
  });

  describe('helmet', () => {
    let app: INestApplication<App>;
    beforeAll(async () => (app = await appWith({})));
    afterAll(() => app.close());

    it('envia os headers de segurança e esconde o X-Powered-By', async () => {
      const response = await request(app.getHttpServer()).get('/health');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers).not.toHaveProperty('x-powered-by');
    });

    it('vale também para respostas de erro', async () => {
      const response = await request(app.getHttpServer()).get('/nao-existe').expect(404);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('CORS', () => {
    const preflight = (app: INestApplication<App>, origin: string) =>
      request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');

    it('sem CORS_ORIGINS, nenhuma origem é liberada', async () => {
      const app = await appWith({ CORS_ORIGINS: '' });
      try {
        const response = await preflight(app, 'https://qualquer.example.com');
        expect(response.headers).not.toHaveProperty('access-control-allow-origin');
      } finally {
        await app.close();
      }
    });

    it('com CORS_ORIGINS, libera só as origens da lista e expõe o x-request-id', async () => {
      const app = await appWith({
        CORS_ORIGINS: 'https://ops.example.com, https://outro.example.com',
      });
      try {
        const allowed = await preflight(app, 'https://ops.example.com').expect(204);
        expect(allowed.headers['access-control-allow-origin']).toBe('https://ops.example.com');
        expect(allowed.headers).not.toHaveProperty('access-control-allow-credentials');

        const other = await preflight(app, 'https://intruso.example.com');
        expect(other.headers).not.toHaveProperty('access-control-allow-origin');

        const actual = await request(app.getHttpServer())
          .get('/health')
          .set('Origin', 'https://ops.example.com');
        expect(actual.headers['access-control-expose-headers']).toBe(
          'x-request-id,Content-Disposition',
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('limite de tentativas no login', () => {
    it('5 tentativas por IP passam; a 6ª recebe 429 com Retry-After', async () => {
      const app = await appWith({ LOGIN_RATE_LIMIT: '5', LOGIN_RATE_TTL: '60' });
      try {
        for (let attempt = 1; attempt <= 5; attempt++) {
          await wrongLogin(app).expect(401);
        }
        const blocked = await wrongLogin(app).expect(429).expect(errorCode('TOO_MANY_REQUESTS'));
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        expect((blocked.body as { message: string }).message).toBe(
          'Muitas tentativas. Aguarde e tente novamente',
        );

        // Só o login tem limite: o resto da API continua respondendo.
        await request(app.getHttpServer()).get('/health').expect(200);
      } finally {
        await app.close();
      }
    });

    it('com TRUST_PROXY=0 (padrão), trocar o X-Forwarded-For não escapa do limite', async () => {
      const app = await appWith({ LOGIN_RATE_LIMIT: '2', TRUST_PROXY: '0' });
      try {
        await wrongLogin(app, '10.0.0.1').expect(401);
        await wrongLogin(app, '10.0.0.2').expect(401);
        await wrongLogin(app, '10.0.0.3').expect(429);
      } finally {
        await app.close();
      }
    });

    it('com TRUST_PROXY=1, cada IP do X-Forwarded-For tem a própria contagem', async () => {
      const app = await appWith({ LOGIN_RATE_LIMIT: '2', TRUST_PROXY: '1' });
      try {
        await wrongLogin(app, '10.0.0.1').expect(401);
        await wrongLogin(app, '10.0.0.1').expect(401);
        await wrongLogin(app, '10.0.0.1').expect(429);
        await wrongLogin(app, '10.0.0.2').expect(401);
      } finally {
        await app.close();
      }
    });
  });
});
