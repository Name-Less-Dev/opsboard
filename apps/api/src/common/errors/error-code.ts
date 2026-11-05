// Códigos estáveis de erro: o front decide pelo `code`, nunca pelo texto da mensagem.
// O status HTTP sai daqui, para um código nunca aparecer com dois status diferentes.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  ORDER_FINALIZED: 409,
  CONCURRENT_UPDATE: 409,
  CONFLICT: 409,
  EXPORT_TOO_LARGE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type DomainErrorCode = keyof typeof ERROR_STATUS;

// HTTP_ERROR não tem status fixo: cobre outros 4xx do framework (ex.: 405, 413) com o status original.
export type ErrorCode = DomainErrorCode | 'HTTP_ERROR';

export const ERROR_CODES: readonly ErrorCode[] = [
  ...(Object.keys(ERROR_STATUS) as DomainErrorCode[]),
  'HTTP_ERROR',
];

export type ValidationDetail = {
  field: string;
  messages: string[];
};

// Corpo de toda resposta de erro (montado pelo AllExceptionsFilter).
export type ErrorResponse = {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ValidationDetail[];
  path: string;
  timestamp: string;
  requestId: string;
};
