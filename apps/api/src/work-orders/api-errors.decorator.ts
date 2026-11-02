import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

const DESCRIPTIONS = {
  400: 'Payload ou parâmetro inválido',
  401: 'Token ausente, inválido ou expirado',
  403: 'Ação válida no fluxo, mas sem permissão para este usuário',
  404: 'Ordem de serviço não encontrada',
  409: 'Transição fora do grafo, ordem em estado final ou alteração simultânea',
} as const;

// Documenta só os códigos que a rota pode devolver, com a mesma descrição em todas.
export const ApiErrors = (...statuses: (keyof typeof DESCRIPTIONS)[]) =>
  applyDecorators(
    ...statuses.map((status) => ApiResponse({ status, description: DESCRIPTIONS[status] })),
  );
