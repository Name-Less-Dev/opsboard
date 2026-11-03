import type { Response } from 'supertest';

// Para encadear depois do status: `.expect(409).expect(errorCode('INVALID_TRANSITION'))`.
// Confere o código e o formato padrão, com o mesmo requestId do header.
export const errorCode = (code: string) => (response: Response) => {
  expect(response.body).toEqual(
    expect.objectContaining({
      statusCode: response.status,
      code,
      message: expect.any(String),
      path: expect.any(String),
      timestamp: expect.any(String),
      requestId: response.headers['x-request-id'],
    }),
  );
};
