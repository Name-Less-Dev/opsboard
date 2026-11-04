import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { WorkOrder } from '../features/work-orders/labels';
import { endOfLocalDayIso, todayDateInput } from '../lib/dates';
import { FIELD_ERROR_MESSAGES } from '../lib/error-messages';
import {
  errorBody,
  makeOrder,
  OTHER_OPERATOR,
  server,
  SUPERVISOR,
  USER,
  USERS,
} from '../test/api-mock';
import { currentUrl, renderAppAs } from '../test/render-app';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return todayDateInput(date);
}

/** Aceita o POST, guarda o corpo e serve o detalhe da ordem criada. */
function mockCreate() {
  const bodies: unknown[] = [];
  let created: WorkOrder | null = null;
  server.use(
    http.get('/api/users', () => HttpResponse.json(USERS)),
    http.post('/api/work-orders', async ({ request }) => {
      const body = (await request.json()) as Partial<WorkOrder> & { assigneeId?: string | null };
      bodies.push(body);
      const assignee = USERS.find((user) => user.id === body.assigneeId);
      created = makeOrder({
        title: body.title,
        priority: body.priority,
        dueDate: body.dueDate,
        assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      });
      return HttpResponse.json(created, { status: 201 });
    }),
    http.get('/api/work-orders/:id', () => HttpResponse.json(created)),
  );
  return bodies;
}

async function fillValid(title = 'Trocar filtro do ar', days = 3) {
  await userEvent.type(await screen.findByLabelText('Título'), title);
  fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: dayFromToday(days) } });
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Criar ordem' }));

describe('Nova ordem (/orders/new)', () => {
  it('operador: responsável fixo (ele mesmo) e criação leva ao detalhe com aviso', async () => {
    const bodies = mockCreate();
    renderAppAs(USER, '/orders/new');

    expect(await screen.findByText('Ana Operadora (você)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Responsável')).not.toBeInTheDocument();
    await fillValid();
    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'Alta');
    await submit();

    expect(await screen.findByText('Ordem criada.')).toBeInTheDocument();
    expect(currentUrl()).toMatch(/^\/orders\/[0-9a-f-]+$/);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Trocar filtro do ar' }),
    ).toBeInTheDocument();
    // Operador não envia assigneeId: a API faz dele o responsável. Prazo = fim do dia local.
    expect(bodies).toEqual([
      {
        title: 'Trocar filtro do ar',
        priority: 'HIGH',
        dueDate: endOfLocalDayIso(dayFromToday(3)),
      },
    ]);
  });

  it('supervisor escolhe o responsável', async () => {
    const bodies = mockCreate();
    renderAppAs(SUPERVISOR, '/orders/new');

    const select = await screen.findByLabelText('Responsável');
    await waitFor(() => expect(select).toBeEnabled());
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Sem responsável',
      'Ana Operadora (Operador)',
      'Bruno Operador (Operador)',
      'Carla Supervisora (Supervisor)',
    ]);
    await fillValid('Revisar gerador');
    await userEvent.type(screen.getByLabelText('Descrição (opcional)'), 'Antes do feriado');
    await userEvent.selectOptions(select, 'Bruno Operador (Operador)');
    await submit();

    expect(await screen.findByText('Ordem criada.')).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        title: 'Revisar gerador',
        description: 'Antes do feriado',
        priority: 'MEDIUM',
        dueDate: endOfLocalDayIso(dayFromToday(3)),
        assigneeId: OTHER_OPERATOR.id,
      },
    ]);
  });

  it('supervisor sem escolher: envia assigneeId null (sem responsável)', async () => {
    const bodies = mockCreate();
    renderAppAs(SUPERVISOR, '/orders/new');
    await waitFor(() => expect(screen.getByLabelText('Responsável')).toBeEnabled());
    await fillValid();
    await submit();

    await screen.findByText('Ordem criada.');
    expect(bodies[0]).toMatchObject({ assigneeId: null });
  });

  it('valida no cliente: título curto e prazo no passado, sem chamar a API', async () => {
    const bodies = mockCreate();
    renderAppAs(USER, '/orders/new');
    await userEvent.type(await screen.findByLabelText('Título'), 'ab');
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: dayFromToday(-1) } });
    await submit();

    const summary = await screen.findByText('Corrija os 2 erros abaixo:');
    expect(summary.parentElement).toHaveFocus();
    const title = screen.getByLabelText('Título');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('O título precisa ter pelo menos 3 caracteres.');
    expect(screen.getByLabelText('Prazo')).toHaveAccessibleDescription(
      expect.stringContaining('O prazo não pode ser anterior a hoje.'),
    );
    expect(bodies).toEqual([]);

    // O link do resumo leva ao campo.
    await userEvent.click(
      screen.getByRole('link', { name: 'O título precisa ter pelo menos 3 caracteres.' }),
    );
    expect(title).toHaveFocus();
  });

  it('valida ao sair do campo', async () => {
    renderAppAs(USER, '/orders/new');
    await userEvent.type(await screen.findByLabelText('Título'), 'ab');
    await userEvent.tab();

    expect(
      await screen.findByText('O título precisa ter pelo menos 3 caracteres.', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('erro 400 da API aparece no campo certo, pelo `field`', async () => {
    server.use(
      http.post('/api/work-orders', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos',
            details: [{ field: 'title', messages: ['title must be longer than 3'] }],
            requestId: 'r1',
          },
          { status: 400 },
        ),
      ),
    );
    renderAppAs(USER, '/orders/new');
    await fillValid();
    await submit();

    const title = screen.getByLabelText('Título');
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'));
    expect(title).toHaveAccessibleDescription(FIELD_ERROR_MESSAGES.title);
    // O texto cru do class-validator não aparece.
    expect(screen.queryByText(/must be longer/)).not.toBeInTheDocument();
    expect(currentUrl()).toBe('/orders/new');
  });

  it('403 na criação aparece no resumo e mantém o que foi digitado', async () => {
    server.use(http.post('/api/work-orders', () => errorBody(403, 'FORBIDDEN')));
    renderAppAs(USER, '/orders/new');
    await fillValid('Minha ordem');
    await submit();

    expect(await screen.findByText('Você não tem permissão para fazer isso.')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Minha ordem');
    expect(screen.getByRole('button', { name: 'Criar ordem' })).toBeEnabled();
  });
});
