import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResult } from './../src/auth/auth.service';
import { createTestApp, operator, TEST_PASSWORD } from './test-app';

// Log de requisição com a aplicação inteira: o que importa é o que NÃO aparece.
describe('Log de requisição (e2e)', () => {
  let app: INestApplication<App>;
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  // Só as linhas do contexto HTTP (o Nest também loga a inicialização).
  const httpLines = () =>
    [...log.mock.calls, ...warn.mock.calls]
      .filter((call) => call[1] === 'HTTP' || String(call[0]).includes('requestId='))
      .map((call) => String(call[0]));

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    log.mockClear();
    warn.mockClear();
  });

  afterAll(async () => {
    await app.close();
    log.mockRestore();
    warn.mockRestore();
  });

  it('login e rota autenticada: uma linha cada, sem senha, e-mail ou token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: operator.email, password: TEST_PASSWORD })
      .expect(200);
    const { accessToken } = login.body as LoginResult;
    const me = await request(app.getHttpServer())
      .get('/auth/me?debug=1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const lines = httpLines();
    expect(lines).toEqual([
      expect.stringMatching(
        new RegExp(
          `^POST /auth/login 200 \\d+ms requestId=${login.headers['x-request-id']} userId=-$`,
        ),
      ),
      expect.stringMatching(
        new RegExp(
          `^GET /auth/me 200 \\d+ms requestId=${me.headers['x-request-id']} userId=${operator.id}$`,
        ),
      ),
    ]);
    const all = lines.join('\n');
    expect(all).not.toContain(TEST_PASSWORD);
    expect(all).not.toContain(operator.email);
    expect(all).not.toContain(accessToken);
    expect(all).not.toContain('debug');
  });

  it('401 de senha errada sai como warn, ainda sem a senha', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: operator.email, password: 'senha-errada-123' })
      .expect(401);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringMatching(/^POST \/auth\/login 401 \d+ms requestId=\S+ userId=-$/),
    ]);
    expect(httpLines().join('\n')).not.toContain('senha-errada-123');
  });

  it('JSON malformado, barrado antes do middleware, também gera uma linha (só uma)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password": "senha-no-json-quebrado"')
      .expect(400);
    expect(httpLines()).toEqual([
      expect.stringMatching(/^POST \/auth\/login 400 \d+ms requestId=\S+ userId=-$/),
    ]);
    expect(httpLines().join('\n')).not.toContain('senha-no-json-quebrado');
  });
});
