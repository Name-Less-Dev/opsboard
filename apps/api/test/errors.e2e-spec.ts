import { Body, Controller, INestApplication, Logger, Post } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Public } from './../src/auth/decorators/public.decorator';
import { errorCode } from './error-code';
import { createTestApp } from './test-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Só existe no teste: simula um erro inesperado com detalhes que não podem vazar.
@Controller('probe')
class FailingController {
  @Public()
  @Post('crash')
  crash(@Body() _body: unknown): never {
    throw new Error('relation "WorkOrder" does not exist');
  }
}

describe('Formato de erro (e2e)', () => {
  let app: INestApplication<App>;
  const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  beforeAll(async () => {
    app = await createTestApp([FailingController]);
  });

  beforeEach(() => logged.mockClear());

  afterAll(async () => {
    await app.close();
    logged.mockRestore();
  });

  const server = () => request(app.getHttpServer());

  it('rota inexistente: 404 no formato padrão, path sem query string', async () => {
    const response = await server()
      .get('/nao-existe?q=texto')
      .expect(404)
      .expect(errorCode('NOT_FOUND'));
    expect(response.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado',
      path: '/nao-existe',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      requestId: expect.stringMatching(UUID) as unknown,
    });
  });

  describe('requestId', () => {
    it('gera um UUID quando o cliente não envia', async () => {
      const response = await server().get('/health');
      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('reaproveita o x-request-id válido do cliente, no header e no corpo', async () => {
      const response = await server()
        .get('/nao-existe')
        .set('x-request-id', 'front-123.abc_X')
        .expect(404);
      expect(response.headers['x-request-id']).toBe('front-123.abc_X');
      expect((response.body as { requestId: string }).requestId).toBe('front-123.abc_X');
    });

    it.each([
      ['com espaço', 'a b'],
      ['com caractere especial', 'id<script>'],
      ['longo demais', 'a'.repeat(129)],
    ])('troca o x-request-id inválido (%s) por um novo', async (_name, sent) => {
      const response = await server().get('/nao-existe').set('x-request-id', sent).expect(404);
      expect(response.headers['x-request-id']).toMatch(UUID);
    });
  });

  it('JSON malformado: 400 VALIDATION_ERROR com details vazio e requestId', async () => {
    const response = await server()
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400)
      .expect(errorCode('VALIDATION_ERROR'));
    expect((response.body as { details: unknown }).details).toEqual([]);
  });

  it('DTO inválido: details por campo, incluindo campo extra', async () => {
    const response = await server()
      .post('/auth/login')
      .send({ email: 'nao-e-email', password: 'x', role: 'SUPERVISOR' })
      .expect(400)
      .expect(errorCode('VALIDATION_ERROR'));
    const { details } = response.body as { details: { field: string }[] };
    expect(details.map((detail) => detail.field).sort()).toEqual(['email', 'role']);
  });

  it('500: mensagem genérica, sem detalhe interno; o log tem o requestId e não tem o corpo', async () => {
    const response = await server()
      .post('/probe/crash')
      .send({ password: 'senha-secreta', token: 'token-secreto' })
      .expect(500)
      .expect(errorCode('INTERNAL_ERROR'));

    expect(response.body).not.toHaveProperty('details');
    expect(JSON.stringify(response.body)).not.toMatch(/WorkOrder|relation|stack|senha|token-/);

    expect(logged).toHaveBeenCalledTimes(1);
    const logLine = logged.mock.calls[0].map(String).join(' ');
    expect(logLine).toContain((response.body as { requestId: string }).requestId);
    expect(logLine).toContain('relation "WorkOrder" does not exist');
    expect(logLine).not.toMatch(/senha-secreta|token-secreto/);
  });

  it('4xx não vai para o log', async () => {
    await server().get('/nao-existe').expect(404);
    expect(logged).not.toHaveBeenCalled();
  });
});
