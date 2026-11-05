import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { WorkOrderPriority, WorkOrderStatus } from '../../generated/prisma/enums';
import type { WorkOrderEventPage } from '../events.service';

// Classes só para a documentação (como em work-order-response.dto.ts). A união discriminada
// por `type` faz o `api-types.ts` do front sair com `details` tipado para cada tipo de evento.

const ACTOR_ID = '9cbbf785-9a72-4703-b484-0afd39d65703';

class EventActorDto {
  @ApiProperty({ format: 'uuid', example: ACTOR_ID })
  id!: string;

  @ApiProperty({ example: 'Carla Supervisora' })
  name!: string;
}

export class EventUserRefDto {
  @ApiProperty({ format: 'uuid', example: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b' })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ana Operadora',
    description: 'null se o usuário não existe mais',
  })
  name!: string | null;
}

export class TitleChangeDto {
  @ApiProperty({ enum: ['title'] })
  field!: 'title';

  @ApiProperty({ example: 'Trocar filtro' })
  from!: string;

  @ApiProperty({ example: 'Trocar filtro do ar' })
  to!: string;
}

export class PriorityChangeDto {
  @ApiProperty({ enum: ['priority'] })
  field!: 'priority';

  @ApiProperty({ enum: WorkOrderPriority, enumName: 'WorkOrderPriority', example: 'MEDIUM' })
  from!: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderPriority, enumName: 'WorkOrderPriority', example: 'URGENT' })
  to!: WorkOrderPriority;
}

export class DueDateChangeDto {
  @ApiProperty({ enum: ['dueDate'] })
  field!: 'dueDate';

  @ApiProperty({ format: 'date-time', example: '2026-11-10T02:59:59.999Z' })
  from!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-12T02:59:59.999Z' })
  to!: string;
}

export class DescriptionChangeDto {
  @ApiProperty({
    enum: ['description'],
    description: 'Só o nome do campo: o texto da descrição não é exposto',
  })
  field!: 'description';
}

const CHANGE_MODELS = [TitleChangeDto, DescriptionChangeDto, PriorityChangeDto, DueDateChangeDto];

export class UpdatedDetailsDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: CHANGE_MODELS.map((model) => ({ $ref: getSchemaPath(model) })),
      discriminator: {
        propertyName: 'field',
        mapping: {
          title: getSchemaPath(TitleChangeDto),
          description: getSchemaPath(DescriptionChangeDto),
          priority: getSchemaPath(PriorityChangeDto),
          dueDate: getSchemaPath(DueDateChangeDto),
        },
      },
    },
    description: 'Na ordem título, descrição, prioridade, prazo',
  })
  changes!: (TitleChangeDto | DescriptionChangeDto | PriorityChangeDto | DueDateChangeDto)[];
}

export class AssignedDetailsDto {
  @ApiProperty({
    type: EventUserRefDto,
    nullable: true,
    description: 'null: estava sem responsável',
  })
  from!: EventUserRefDto | null;

  @ApiProperty({ type: EventUserRefDto, nullable: true, description: 'null: responsável removido' })
  to!: EventUserRefDto | null;
}

abstract class EventBaseDto {
  @ApiProperty({ format: 'uuid', example: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b' })
  id!: string;

  @ApiProperty({ type: EventActorDto, description: 'Quem fez a ação (só id e nome)' })
  actor!: EventActorDto;

  @ApiProperty({
    enum: WorkOrderStatus,
    enumName: 'WorkOrderStatus',
    nullable: true,
    example: null,
    description: 'Só em STATUS_CHANGED',
  })
  fromStatus!: WorkOrderStatus | null;

  @ApiProperty({
    enum: WorkOrderStatus,
    enumName: 'WorkOrderStatus',
    nullable: true,
    example: null,
    description: 'Em STATUS_CHANGED, o novo status; em CREATED, o status inicial (OPEN)',
  })
  toStatus!: WorkOrderStatus | null;

  @ApiProperty({ format: 'date-time', example: '2026-11-05T14:30:00.000Z' })
  createdAt!: Date;
}

// `details` que só pode ser null: em OpenAPI 3.0 não existe `type: null`; `enum: [null]` com
// `nullable` é a forma que o openapi-typescript traduz para `null`.
const NULL_DETAILS = { nullable: true, enum: [null], example: null } as const;

export class CreatedEventDto extends EventBaseDto {
  @ApiProperty({ enum: ['CREATED'] })
  type!: 'CREATED';

  @ApiProperty({ ...NULL_DETAILS, description: 'Sempre null' })
  details!: null;
}

export class StatusChangedEventDto extends EventBaseDto {
  @ApiProperty({ enum: ['STATUS_CHANGED'] })
  type!: 'STATUS_CHANGED';

  @ApiProperty({ ...NULL_DETAILS, description: 'Sempre null: o status vai em fromStatus/toStatus' })
  details!: null;
}

export class UpdatedEventDto extends EventBaseDto {
  @ApiProperty({ enum: ['UPDATED'] })
  type!: 'UPDATED';

  @ApiProperty({
    type: UpdatedDetailsDto,
    nullable: true,
    description: 'null se o registro antigo estiver em formato inesperado',
  })
  details!: UpdatedDetailsDto | null;
}

export class AssignedEventDto extends EventBaseDto {
  @ApiProperty({ enum: ['ASSIGNED'] })
  type!: 'ASSIGNED';

  @ApiProperty({
    type: AssignedDetailsDto,
    nullable: true,
    description: 'null se o registro antigo estiver em formato inesperado',
  })
  details!: AssignedDetailsDto | null;
}

export const EVENT_MODELS = [
  CreatedEventDto,
  StatusChangedEventDto,
  UpdatedEventDto,
  AssignedEventDto,
  ...CHANGE_MODELS,
];

export class WorkOrderEventPageDto implements Omit<WorkOrderEventPage, 'items'> {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [CreatedEventDto, StatusChangedEventDto, UpdatedEventDto, AssignedEventDto].map(
        (model) => ({ $ref: getSchemaPath(model) }),
      ),
      discriminator: {
        propertyName: 'type',
        mapping: {
          CREATED: getSchemaPath(CreatedEventDto),
          STATUS_CHANGED: getSchemaPath(StatusChangedEventDto),
          UPDATED: getSchemaPath(UpdatedEventDto),
          ASSIGNED: getSchemaPath(AssignedEventDto),
        },
      },
    },
    description: 'Mais recente primeiro; empate no mesmo instante desfeito pelo id',
  })
  items!: (CreatedEventDto | StatusChangedEventDto | UpdatedEventDto | AssignedEventDto)[];

  @ApiProperty({ example: 27 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 2, description: 'Arredondado para cima; 0 quando não há eventos' })
  totalPages!: number;
}

/** Exemplo do Swagger com um evento de cada tipo. */
export const EVENT_PAGE_EXAMPLE = {
  items: [
    {
      id: 'b1a2c3d4-0000-4000-8000-000000000004',
      type: 'STATUS_CHANGED',
      actor: { id: ACTOR_ID, name: 'Ana Operadora' },
      fromStatus: 'OPEN',
      toStatus: 'IN_PROGRESS',
      details: null,
      createdAt: '2026-11-05T14:30:00.000Z',
    },
    {
      id: 'b1a2c3d4-0000-4000-8000-000000000003',
      type: 'UPDATED',
      actor: { id: ACTOR_ID, name: 'Carla Supervisora' },
      fromStatus: null,
      toStatus: null,
      details: {
        changes: [
          { field: 'title', from: 'Trocar filtro', to: 'Trocar filtro do ar' },
          { field: 'description' },
          { field: 'priority', from: 'MEDIUM', to: 'URGENT' },
        ],
      },
      createdAt: '2026-11-05T13:10:00.000Z',
    },
    {
      id: 'b1a2c3d4-0000-4000-8000-000000000002',
      type: 'ASSIGNED',
      actor: { id: ACTOR_ID, name: 'Carla Supervisora' },
      fromStatus: null,
      toStatus: null,
      details: {
        from: null,
        to: { id: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b', name: 'Ana Operadora' },
      },
      createdAt: '2026-11-05T12:05:00.000Z',
    },
    {
      id: 'b1a2c3d4-0000-4000-8000-000000000001',
      type: 'CREATED',
      actor: { id: ACTOR_ID, name: 'Carla Supervisora' },
      fromStatus: null,
      toStatus: 'OPEN',
      details: null,
      createdAt: '2026-11-05T12:00:00.000Z',
    },
  ],
  total: 4,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};
