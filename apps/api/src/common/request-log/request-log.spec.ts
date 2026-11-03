import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { formatRequestLog, requestLogMiddleware } from './request-log';

describe('formatRequestLog', () => {
  it('uma linha com método, caminho, status, duração, requestId e userId', () => {
    expect(
      formatRequestLog({
        method: 'PATCH',
        path: '/work-orders/abc/status',
        statusCode: 200,
        durationMs: 12,
        requestId: 'req-1',
        userId: 'user-1',
      }),
    ).toBe('PATCH /work-orders/abc/status 200 12ms requestId=req-1 userId=user-1');
  });

  it('sem usuário (rota pública ou 401) e sem requestId, usa "-"', () => {
    expect(
      formatRequestLog({ method: 'GET', path: '/health', statusCode: 200, durationMs: 0 }),
    ).toBe('GET /health 200 0ms requestId=- userId=-');
  });
});

describe('requestLogMiddleware', () => {
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    log.mockClear();
    warn.mockClear();
  });

  afterAll(() => {
    log.mockRestore();
    warn.mockRestore();
  });

  // Dublês mínimos: a resposta só precisa emitir `finish` e ter statusCode.
  function run(statusCode: number, user?: { id: string }) {
    const req = {
      method: 'POST',
      originalUrl: '/auth/login?q=busca',
      requestId: 'req-1',
      user,
      headers: { authorization: 'Bearer token-secreto' },
      body: { password: 'senha-secreta' },
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { statusCode }) as unknown as Response;
    const next = jest.fn() as NextFunction;
    requestLogMiddleware(req, res, next);
    return { res, next };
  }

  it('chama next na hora e só registra quando a resposta termina', () => {
    const { res, next } = run(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    res.emit('finish');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('2xx como log, com userId e sem query string', () => {
    run(200, { id: 'user-1' }).res.emit('finish');
    expect(log.mock.calls[0][0]).toMatch(
      /^POST \/auth\/login 200 \d+ms requestId=req-1 userId=user-1$/,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([401, 500])('%i como warn', (status) => {
    run(status).res.emit('finish');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('nunca inclui corpo, headers ou token', () => {
    run(200).res.emit('finish');
    expect(String(log.mock.calls[0][0])).not.toMatch(/senha|token|Bearer|busca/);
  });
});
