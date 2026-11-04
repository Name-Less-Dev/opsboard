import { ApiError, type ApiErrorCode } from './api';

// Único lugar com as mensagens de erro para o usuário. A tela decide pelo `code`, nunca pelo
// texto da API. `Record<ApiErrorCode, string>` não compila se a API ganhar um código sem
// mensagem aqui (depois de `npm run contract:generate`).
export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Alguns dados estão inválidos. Confira os campos e tente de novo.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo para continuar.',
  FORBIDDEN: 'Você não tem permissão para fazer isso.',
  NOT_FOUND: 'Não encontramos o que você procurava.',
  INVALID_TRANSITION: 'Essa mudança de status não é permitida.',
  ORDER_FINALIZED: 'Esta ordem já foi concluída ou cancelada e não pode mais ser alterada.',
  CONCURRENT_UPDATE: 'Outra pessoa alterou esta ordem agora há pouco. Recarregue e tente de novo.',
  CONFLICT: 'Não foi possível salvar por conflito com outros dados.',
  TOO_MANY_REQUESTS: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
  HTTP_ERROR: 'Não foi possível concluir a requisição.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado no servidor.',
  SERVICE_UNAVAILABLE: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  NETWORK_ERROR: 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.',
  // Resposta fora do formato da API: quem respondeu foi o proxy (API fora do ar ou reiniciando).
  BAD_RESPONSE: 'Não foi possível falar com o servidor. Tente de novo em instantes.',
};

export const DEFAULT_ERROR_MESSAGE = 'Algo deu errado. Tente de novo.';

/** Mensagens do login que trocam o texto geral de alguns códigos. */
export const LOGIN_ERROR_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  // Mesma resposta para senha errada e e-mail inexistente, como na API.
  UNAUTHORIZED: 'E-mail ou senha inválidos.',
};

function isKnownCode(code: string): code is ApiErrorCode {
  return Object.hasOwn(ERROR_MESSAGES, code);
}

/** Mensagem para qualquer erro lançado; o que não é `ApiError` cai no texto padrão. */
export function errorMessage(
  error: unknown,
  overrides: Partial<Record<ApiErrorCode, string>> = {},
): string {
  if (!(error instanceof ApiError) || !isKnownCode(error.code)) return DEFAULT_ERROR_MESSAGE;
  return overrides[error.code] ?? ERROR_MESSAGES[error.code];
}

/**
 * Erro inesperado: 5xx com o formato da API (o detalhe ficou no log do servidor) ou código
 * desconhecido. Só nesses o `requestId` aparece para a pessoa informar ao suporte.
 */
export function isUnexpectedError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  return error.code === 'INTERNAL_ERROR' || !isKnownCode(error.code);
}
