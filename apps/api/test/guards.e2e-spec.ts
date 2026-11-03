import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { Roles } from './../src/auth/decorators/roles.decorator';
import { Role } from './../src/generated/prisma/enums';
import { createTestApp, operator, supervisor } from './test-app';
import { errorCode } from './error-code';

// Só existe no teste: ainda não há rota real restrita por perfil (o CRUD começa no Dia 3).
@Controller('probe')
class ProbeController {
  @Get('authenticated')
  authenticated() {
    return { ok: true };
  }

  @Get('supervisor')
  @Roles(Role.SUPERVISOR)
  supervisorOnly() {
    return { ok: true };
  }
}

describe('Guards globais (e2e)', () => {
  const jwt = new JwtService({ secret: 'segredo-de-teste-com-pelo-menos-32-caracteres' }); // igual ao de setup-env.ts
  let app: INestApplication<App>;

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    app = await createTestApp([ProbeController]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JwtAuthGuard', () => {
    it('401 sem token', () =>
      get('/probe/authenticated').expect(401).expect(errorCode('UNAUTHORIZED')));

    it('401 com token malformado', () =>
      get('/probe/authenticated', 'nao-e-um-jwt').expect(401).expect(errorCode('UNAUTHORIZED')));

    it('401 com token assinado por outro segredo', () => {
      const forged = new JwtService({ secret: 'outro' }).sign({ sub: supervisor.id });
      return get('/probe/authenticated', forged).expect(401).expect(errorCode('UNAUTHORIZED'));
    });

    it('401 com token expirado', () => {
      const expired = jwt.sign({ sub: operator.id }, { expiresIn: -10 });
      return get('/probe/authenticated', expired).expect(401).expect(errorCode('UNAUTHORIZED'));
    });

    it('401 quando o usuário do token não existe mais', () => {
      return get('/probe/authenticated', jwt.sign({ sub: 'removido' }))
        .expect(401)
        .expect(errorCode('UNAUTHORIZED'));
    });

    it('200 com token válido', () => {
      return get('/probe/authenticated', jwt.sign({ sub: operator.id })).expect(200);
    });

    it('/health continua público', () => get('/health').expect(200));
  });

  describe('RolesGuard', () => {
    it('401 sem token (autenticação vem antes do perfil)', () => {
      return get('/probe/supervisor').expect(401).expect(errorCode('UNAUTHORIZED'));
    });

    it('403 com perfil insuficiente', () => {
      return get('/probe/supervisor', jwt.sign({ sub: operator.id }))
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
    });

    it('200 com o perfil exigido', () => {
      return get('/probe/supervisor', jwt.sign({ sub: supervisor.id })).expect(200);
    });
  });
});
