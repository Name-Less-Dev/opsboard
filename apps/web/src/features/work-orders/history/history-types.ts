import type { components } from '../../../lib/api-types';

// Tipos do contrato gerado (api-types.ts): `details` já vem tipado por `type`.
export type WorkOrderEventPage = components['schemas']['WorkOrderEventPageDto'];
export type WorkOrderEvent = WorkOrderEventPage['items'][number];
export type EventType = WorkOrderEvent['type'];
export type FieldChange = components['schemas']['UpdatedDetailsDto']['changes'][number];
