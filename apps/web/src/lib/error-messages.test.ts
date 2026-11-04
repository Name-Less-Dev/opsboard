import { describe, expect, it } from 'vitest';
import openapiText from '../../../api/openapi.json?raw';
import { ApiError } from './api';
import {
  DEFAULT_ERROR_MESSAGE,
  ERROR_MESSAGES,
  errorMessage,
  isUnexpectedError,
  LOGIN_ERROR_MESSAGES,
} from './error-messages';

// Lê os códigos do contrato versionado da API, não da lista do front: se a API ganhar um
// código e alguém regenerar o contrato, este teste aponta a mensagem que falta.
const openapi = JSON.parse(openapiText) as {
  components: { schemas: { ErrorCode: { enum: string[] } } };
};
const SERVER_CODES = openapi.components.schemas.ErrorCode.enum;

const apiError = (code: string, statusCode = 400) =>
  new ApiError({ statusCode, code, message: 'texto da API', requestId: 'r1' });

describe('mensagens de erro', () => {
  it('o contrato tem os códigos do Dia 5', () => {
    expect(SERVER_CODES).toEqual(
      expect.arrayContaining(['VALIDATION_ERROR', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']),
    );
  });

  it.each(SERVER_CODES)('%s tem mensagem própria', (code) => {
    expect(Object.hasOwn(ERROR_MESSAGES, code)).toBe(true);
    expect(errorMessage(apiError(code))).not.toBe(DEFAULT_ERROR_MESSAGE);
  });

  it.each(['NETWORK_ERROR', 'BAD_RESPONSE'])('código do cliente %s tem mensagem', (code) => {
    expect(errorMessage(apiError(code, 0))).not.toBe(DEFAULT_ERROR_MESSAGE);
  });

  it('usa o code, nunca o texto da API', () => {
    expect(errorMessage(apiError('FORBIDDEN'))).toBe(ERROR_MESSAGES.FORBIDDEN);
    expect(errorMessage(apiError('FORBIDDEN'))).not.toContain('texto da API');
  });

  it.each([
    ['código desconhecido', apiError('TEAPOT', 418)],
    ['nome de propriedade herdada', apiError('toString')],
    ['erro que não é ApiError', new Error('boom')],
    ['valor qualquer', 'boom'],
  ])('%s cai no texto padrão', (_name, error) => {
    expect(errorMessage(error)).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it('o login troca só o texto do UNAUTHORIZED', () => {
    expect(errorMessage(apiError('UNAUTHORIZED', 401), LOGIN_ERROR_MESSAGES)).toBe(
      'E-mail ou senha inválidos.',
    );
    expect(errorMessage(apiError('TOO_MANY_REQUESTS', 429), LOGIN_ERROR_MESSAGES)).toBe(
      ERROR_MESSAGES.TOO_MANY_REQUESTS,
    );
  });
});

describe('isUnexpectedError (mostra o requestId)', () => {
  it.each<[string, unknown, boolean]>([
    ['500 da API', apiError('INTERNAL_ERROR', 500), true],
    ['código desconhecido', apiError('TEAPOT', 418), true],
    ['validação', apiError('VALIDATION_ERROR'), false],
    ['banco fora (503)', apiError('SERVICE_UNAVAILABLE', 503), false],
    ['falha de rede', apiError('NETWORK_ERROR', 0), false],
    ['proxy fora do formato', apiError('BAD_RESPONSE', 502), false],
    ['não é ApiError', new Error('x'), false],
  ])('%s → %s', (_name, error, expected) => {
    expect(isUnexpectedError(error)).toBe(expected);
  });
});
