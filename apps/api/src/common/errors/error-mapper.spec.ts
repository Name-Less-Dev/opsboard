import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '../../generated/prisma/client';
import { DomainException, validationError } from './domain.exception';
import { type DomainErrorCode, ERROR_STATUS } from './error-code';
import { mapError } from './error-mapper';

const prismaError = (code: string, message = 'Invalid `prisma.workOrder.update()` invocation') =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: '7.10.1' });

const GENERIC_500 = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'Erro interno. Se persistir, informe o requestId ao suporte',
  logInternally: true,
};

describe('mapError', () => {
  describe('DomainException', () => {
    it.each<[DomainErrorCode, number]>([
      ['UNAUTHORIZED', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['INVALID_TRANSITION', 409],
      ['ORDER_FINALIZED', 409],
      ['CONCURRENT_UPDATE', 409],
      ['CONFLICT', 409],
      ['TOO_MANY_REQUESTS', 429],
      ['SERVICE_UNAVAILABLE', 503],
    ])('%s → %i, com a mensagem do domínio e sem details', (code, status) => {
      expect(mapError(new DomainException(code, 'Mensagem do domínio'))).toEqual({
        statusCode: status,
        code,
        message: 'Mensagem do domínio',
        logInternally: status >= 500,
      });
    });

    it('o status sempre sai da tabela do código', () => {
      for (const [code, status] of Object.entries(ERROR_STATUS)) {
        expect(new DomainException(code as DomainErrorCode, 'x').getStatus()).toBe(status);
      }
    });

    it('VALIDATION_ERROR leva details', () => {
      const details = [{ field: 'assigneeId', messages: ['Responsável não encontrado'] }];
      expect(mapError(validationError(details))).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details,
        logInternally: false,
      });
    });

    it('VALIDATION_ERROR sem campos ainda tem details (vazio)', () => {
      expect(mapError(validationError([], 'Informe ao menos um campo'))).toMatchObject({
        message: 'Informe ao menos um campo',
        details: [],
      });
    });

    it('details é descartado em códigos que não são de validação', () => {
      const error = new DomainException('FORBIDDEN', 'x', [{ field: 'a', messages: ['b'] }]);
      expect(mapError(error)).not.toHaveProperty('details');
    });

    it('a mensagem genérica do login passa sem alteração', () => {
      expect(mapError(new DomainException('UNAUTHORIZED', 'Credenciais inválidas'))).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas',
      });
    });
  });

  describe('HttpException do framework', () => {
    it.each([
      [
        'guard sem token',
        new UnauthorizedException(),
        401,
        'UNAUTHORIZED',
        'Autenticação necessária',
      ],
      ['RolesGuard', new ForbiddenException(), 403, 'FORBIDDEN', 'Sem permissão para esta ação'],
      [
        'rota inexistente',
        new NotFoundException('Cannot GET /x'),
        404,
        'NOT_FOUND',
        'Recurso não encontrado',
      ],
      [
        'conflito genérico',
        new ConflictException('conflict'),
        409,
        'CONFLICT',
        'Conflito com o estado atual do recurso',
      ],
      [
        'throttler',
        new ThrottlerException(),
        429,
        'TOO_MANY_REQUESTS',
        'Muitas tentativas. Aguarde e tente novamente',
      ],
      [
        'indisponível',
        new ServiceUnavailableException('db down'),
        503,
        'SERVICE_UNAVAILABLE',
        'Serviço indisponível',
      ],
      [
        'outro 4xx',
        new PayloadTooLargeException(),
        413,
        'HTTP_ERROR',
        'Requisição não pôde ser atendida',
      ],
      [
        'status sem classe própria',
        new HttpException('Method Not Allowed', 405),
        405,
        'HTTP_ERROR',
        'Requisição não pôde ser atendida',
      ],
    ])(
      '%s → %i %s, com texto da tabela (nunca o do Nest)',
      (_name, error, status, code, message) => {
        const mapped = mapError(error);
        // 503 vai para o log (banco fora do ar é o que se quer ver lá); 4xx não.
        expect(mapped).toMatchObject({
          statusCode: status,
          code,
          message,
          logInternally: status >= 500,
        });
        expect(mapped).not.toHaveProperty('details');
      },
    );

    it('400 do framework (ex.: JSON malformado) vira VALIDATION_ERROR com details vazio', () => {
      expect(mapError(new BadRequestException(['Unexpected token } in JSON']))).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida',
        details: [],
        logInternally: false,
      });
    });

    it('5xx do framework (exceto 503) vira o 500 genérico, sem a mensagem original', () => {
      const mapped = mapError(
        new InternalServerErrorException('relation "WorkOrder" does not exist'),
      );
      expect(mapped).toEqual(GENERIC_500);
    });
  });

  describe('erros do Prisma', () => {
    it.each([
      ['P2025', 404, 'NOT_FOUND', 'Registro não encontrado'],
      ['P2002', 409, 'CONFLICT', 'Já existe um registro com estes dados'],
      ['P2003', 409, 'CONFLICT', 'Registro relacionado não encontrado'],
    ])('%s → %i %s', (prismaCode, status, code, message) => {
      expect(mapError(prismaError(prismaCode))).toEqual({
        statusCode: status,
        code,
        message,
        logInternally: false,
      });
    });

    it('outro código do Prisma vira o 500 genérico, sem a mensagem do Prisma', () => {
      const mapped = mapError(prismaError('P1001', "Can't reach database server at db:5432"));
      expect(mapped).toEqual(GENERIC_500);
      expect(JSON.stringify(mapped)).not.toMatch(/db:5432|prisma/i);
    });
  });

  describe('erro desconhecido', () => {
    it.each([
      ['Error comum', new Error('relation "WorkOrder" does not exist')],
      ['TypeError', new TypeError("Cannot read properties of undefined (reading 'id')")],
      ['string lançada', 'falhou'],
      ['undefined', undefined],
      ['objeto qualquer', { statusCode: 400, message: 'parece HttpException mas não é' }],
    ])('%s → 500 genérico, sem vazar nada', (_name, error) => {
      const mapped = mapError(error);
      expect(mapped).toEqual(GENERIC_500);
      expect(JSON.stringify(mapped)).not.toMatch(/WorkOrder|undefined|falhou|parece/);
    });
  });
});
