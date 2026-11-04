import { z } from 'zod';
import type { WorkOrderPriority } from './labels';

// Espelha as regras da API (CreateWorkOrderDto/UpdateWorkOrderDto) só para dar retorno rápido.
// Quem valida de verdade é a API: os erros 400 dela são mapeados para os campos pelo `field`.
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;

// Lista literal para o zod inferir o tipo do enum; o `satisfies` falha se sair do enum da API.
const PRIORITY_VALUES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const satisfies readonly WorkOrderPriority[];

const baseShape = {
  // A API apara antes de validar; aqui também, para "  ab  " contar como 2 caracteres.
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, `O título precisa ter pelo menos ${TITLE_MIN} caracteres.`)
    .max(TITLE_MAX, `O título pode ter no máximo ${TITLE_MAX} caracteres.`),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `A descrição pode ter no máximo ${DESCRIPTION_MAX} caracteres.`),
  priority: z.enum(PRIORITY_VALUES, { error: 'Escolha a prioridade.' }),
  dueDate: z.string().min(1, 'Informe o prazo.'),
};

/** Criação: o prazo não pode ser anterior a hoje (data local). */
export function createWorkOrderSchema(today: string) {
  return z.object({
    ...baseShape,
    // AAAA-MM-DD compara como texto na mesma ordem das datas.
    dueDate: baseShape.dueDate.refine(
      (value) => value === '' || value >= today,
      'O prazo não pode ser anterior a hoje.',
    ),
  });
}

/** Edição: prazo no passado é permitido (a API só proíbe na criação). */
export const editWorkOrderSchema = z.object(baseShape);
