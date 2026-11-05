import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { ERROR_CODES } from './../src/common/errors/error-code';
import { buildOpenApiDocument } from './../src/openapi';
import { createTestApp } from './test-app';

type Response = { content?: Record<string, { schema?: { $ref?: string } }> };
const ERROR_REF = '#/components/schemas/ErrorResponseDto';

// Confere o documento gerado, que é a fonte dos tipos do front (openapi.json).
describe('Documento OpenAPI (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createTestApp();
    document = buildOpenApiDocument(app);
  });

  afterAll(() => app.close());

  const operations = () =>
    Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item as Record<string, { responses: Record<string, Response> }>).map(
        ([method, operation]) => ({ name: `${method.toUpperCase()} ${path}`, operation }),
      ),
    );

  it('ErrorResponseDto tem todos os campos do formato e a lista de códigos', () => {
    const schema = document.components?.schemas?.ErrorResponseDto as {
      required: string[];
      properties: Record<string, { $ref?: string }>;
    };
    expect([...schema.required].sort()).toEqual(
      ['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
    );
    expect(Object.keys(schema.properties)).toContain('details');
    expect(document.components?.schemas?.ErrorCode).toMatchObject({ enum: [...ERROR_CODES] });
  });

  it('toda resposta 4xx/5xx de toda rota usa o ErrorResponseDto, e toda rota documenta o 500', () => {
    const problems: string[] = [];
    for (const { name, operation } of operations()) {
      if (!operation.responses['500']) problems.push(`${name}: sem 500`);
      for (const [status, response] of Object.entries(operation.responses)) {
        if (Number(status) < 400) continue;
        const ref = response.content?.['application/json']?.schema?.$ref;
        if (ref !== ERROR_REF) problems.push(`${name} ${status}: schema ${ref ?? 'ausente'}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('documenta as rotas de erro esperadas', () => {
    const statuses = (path: string, method: string) =>
      Object.keys(
        (document.paths[path] as Record<string, { responses: object }>)[method].responses,
      ).sort();
    expect(statuses('/auth/login', 'post')).toEqual(['200', '400', '401', '429', '500']);
    expect(statuses('/health', 'get')).toEqual(['200', '500', '503']);
    expect(statuses('/users', 'get')).toEqual(['200', '401', '403', '500']);
    expect(statuses('/work-orders/{id}/events', 'get')).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
    expect(statuses('/work-orders/{id}/status', 'patch')).toEqual(
      ['200', '400', '401', '403', '404', '409', '500'].sort(),
    );
  });

  it('histórico: items é união discriminada por type, com exemplo de cada tipo', () => {
    const operation = (
      document.paths['/work-orders/{id}/events'] as Record<
        string,
        { responses: Record<string, { content: Record<string, { example?: unknown }> }> }
      >
    ).get;
    const page = document.components?.schemas?.WorkOrderEventPageDto as {
      properties: { items: { items: { oneOf: { $ref: string }[]; discriminator: object } } };
    };
    expect(page.properties.items.items.discriminator).toEqual(
      expect.objectContaining({ propertyName: 'type' }),
    );
    expect(page.properties.items.items.oneOf.map((item) => item.$ref).sort()).toEqual(
      ['AssignedEventDto', 'CreatedEventDto', 'StatusChangedEventDto', 'UpdatedEventDto']
        .map((name) => `#/components/schemas/${name}`)
        .sort(),
    );
    const example = operation.responses['200'].content['application/json'].example as {
      items: { type: string }[];
    };
    expect(example.items.map((item) => item.type).sort()).toEqual([
      'ASSIGNED',
      'CREATED',
      'STATUS_CHANGED',
      'UPDATED',
    ]);
  });
});
