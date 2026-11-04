import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { shouldRetry } from './query-client';

const error = (statusCode: number, code = 'X') => new ApiError({ statusCode, code, message: '' });

describe('shouldRetry', () => {
  it.each<[string, unknown, boolean]>([
    ['falha de rede', error(0, 'NETWORK_ERROR'), true],
    ['500', error(500, 'INTERNAL_ERROR'), true],
    ['502 do proxy', error(502, 'BAD_RESPONSE'), true],
    ['503', error(503, 'SERVICE_UNAVAILABLE'), true],
    ['400', error(400, 'VALIDATION_ERROR'), false],
    ['401', error(401, 'UNAUTHORIZED'), false],
    ['403', error(403, 'FORBIDDEN'), false],
    ['404', error(404, 'NOT_FOUND'), false],
    ['429', error(429, 'TOO_MANY_REQUESTS'), false],
    ['erro que não veio do cliente HTTP', new Error('bug'), false],
  ])('primeira falha: %s → %s', (_name, err, expected) => {
    expect(shouldRetry(0, err)).toBe(expected);
  });

  it('no máximo uma repetição', () => {
    expect(shouldRetry(1, error(500))).toBe(false);
    expect(shouldRetry(1, error(0))).toBe(false);
  });
});
