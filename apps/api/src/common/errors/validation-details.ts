import type { ValidationError } from 'class-validator';
import type { ValidationDetail } from './error-code';

// Converte a árvore de erros do class-validator numa lista plana, uma entrada por campo.
// Campos aninhados viram caminho com ponto (ex.: `assignee.id`, `items.0.title`).
export function toValidationDetails(
  errors: readonly ValidationError[],
  parentPath = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: ValidationDetail[] = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...toValidationDetails(error.children ?? [], field)];
  });
}
