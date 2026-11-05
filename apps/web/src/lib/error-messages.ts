import { ApiError, type ApiErrorCode } from './api';

// Único lugar com as mensagens de erro para o usuário. A tela decide pelo `code`, nunca pelo
// texto da API. `Record<ApiErrorCode, string>` não compila se a API ganhar um código sem
// mensagem aqui (depois de `npm run contract:generate`).
export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Alguns dados estão inválidos. Confira os campos e tente de novo.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo para continuar.',
  FORBIDDEN: 'Você não tem permissão para fazer isso.',
  NOT_FOUND: 'Esta ordem não existe mais. Ela pode ter sido excluída.',
  // Os 409 recarregam o detalhe (use-work-order.ts): a mensagem diz que a tela foi atualizada.
  INVALID_TRANSITION:
    'Essa mudança de status não é mais possível: a ordem mudou. Os dados foram atualizados.',
  ORDER_FINALIZED:
    'Esta ordem já foi concluída ou cancelada e não pode mais ser alterada. Os dados foram atualizados.',
  CONCURRENT_UPDATE:
    'Outra pessoa alterou esta ordem agora há pouco. Confira os dados atualizados e tente de novo.',
  CONFLICT: 'Não foi possível salvar por conflito com outros dados.',
  TOO_MANY_REQUESTS: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
  EXPORT_TOO_LARGE:
    'A exportação passa do limite de linhas. Use mais filtros para reduzir o resultado e tente de novo.',
  // A tela de importação mostra a mensagem da API neste código (ela diz o que há de errado no arquivo).
  IMPORT_FILE_INVALID: 'Não foi possível ler o arquivo. Confira o formato e tente de novo.',
  IMPORT_INVALID:
    'O arquivo tem linhas com erro e nenhuma ordem foi importada. Confira o relatório.',
  PAYLOAD_TOO_LARGE: 'O arquivo passa de 1 MB. Divida em arquivos menores.',
  HTTP_ERROR: 'Não foi possível concluir a requisição.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado no servidor.',
  SERVICE_UNAVAILABLE: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  NETWORK_ERROR: 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.',
  // Resposta fora do formato da API: quem respondeu foi o proxy (API fora do ar ou reiniciando).
  BAD_RESPONSE: 'Não foi possível falar com o servidor. Tente de novo em instantes.',
};

export const DEFAULT_ERROR_MESSAGE = 'Algo deu errado. Tente de novo.';

/**
 * Mensagens por campo para o `details` de um 400 da API. O texto que vem em `details` é do
 * class-validator (inglês, pode mudar), então só o NOME do campo é usado.
 */
export const FIELD_ERROR_MESSAGES: Record<string, string> = {
  title: 'O servidor recusou o título: use de 3 a 120 caracteres.',
  description: 'O servidor recusou a descrição: use no máximo 2000 caracteres.',
  priority: 'O servidor recusou a prioridade. Escolha uma da lista.',
  dueDate: 'O servidor recusou o prazo. Na criação, ele não pode estar no passado.',
  assigneeId: 'Responsável não encontrado. Escolha outro usuário.',
};

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
