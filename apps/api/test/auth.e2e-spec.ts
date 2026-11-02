import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResult } from './../src/auth/auth.service';
import { createTestApp, operator, TEST_PASSWORD } from './test-app';

describe('Fluxo de autenticação (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login → /auth/me devolve o usuário autenticado, sem o hash', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: operator.email, password: TEST_PASSWORD })
      .expect(200);
    const { accessToken, user } = login.body as LoginResult;
    const expectedUser = {
      id: operator.id,
      name: operator.name,
      email: operator.email,
      role: operator.role,
    };
    expect(user).toEqual(expectedUser);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toEqual(expectedUser);
  });

  it('401 com a mesma resposta para senha errada e e-mail inexistente', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: operator.email, password: 'errada' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ninguem@opsboard.dev', password: 'errada' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('400 para e-mail malformado e para campos fora do DTO', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nao-e-email', password: 'x' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: operator.email, password: TEST_PASSWORD, role: 'SUPERVISOR' })
      .expect(400);
  });
});
