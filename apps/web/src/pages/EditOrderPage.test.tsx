import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../lib/error-messages';
import { errorBody, makeOrder, OTHER_OPERATOR, server, SUPERVISOR, USER } from '../test/api-mock';
import { mockOrderApi } from '../test/order-api-mock';
import { currentUrl, renderAppAs } from '../test/render-app';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ORDER = makeOrder({
  title: 'Trocar filtro',
  description: 'Sala 2',
  priority: 'MEDIUM',
  // 15:00 UTC = 12:00 em São Paulo: o input mostra 10/11/2026.
  dueDate: '2026-11-10T15:00:00.000Z',
  assignee: { id: USER.id, name: USER.name },
});

async function openEdit(user = USER, order = ORDER) {
  const api = mockOrderApi(order);
  renderAppAs(user, `/orders/${order.id}/edit`);
  await screen.findByRole('button', { name: 'Salvar alterações' });
  return api;
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

describe('Editar ordem (/orders/:id/edit)', () => {
  it('preenche o formulário com a ordem (prazo no dia local)', async () => {
    await openEdit(SUPERVISOR);
    expect(screen.getByLabelText('Título')).toHaveValue('Trocar filtro');
    expect(screen.getByLabelText('Descrição (opcional)')).toHaveValue('Sala 2');
    expect(screen.getByLabelText('Prioridade')).toHaveValue('MEDIUM');
    expect(screen.getByLabelText('Prazo')).toHaveValue('2026-11-10');
  });

  it('supervisor: envia só os campos alterados e volta ao detalhe com aviso', async () => {
    const api = await openEdit(SUPERVISOR);
    await userEvent.clear(screen.getByLabelText('Título'));
    await userEvent.type(screen.getByLabelText('Título'), 'Trocar filtro e limpar');
    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'Urgente');
    await save();

    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
    expect(currentUrl()).toBe(`/orders/${ORDER.id}`);
    expect(api.requests).toEqual([
      {
        method: 'PATCH',
        path: `/api/work-orders/${ORDER.id}`,
        body: { title: 'Trocar filtro e limpar', priority: 'URGENT' },
      },
    ]);
  });

  it('prazo alterado vai como fim do dia local', async () => {
    const api = await openEdit(SUPERVISOR);
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-11-12' } });
    await save();

    await screen.findByText('Alterações salvas.');
    expect(api.requests[0]?.body).toEqual({ dueDate: '2026-11-13T02:59:59.999Z' });
  });

  it('sem alteração não chama a API e avisa', async () => {
    const api = await openEdit(SUPERVISOR);
    await save();

    expect(
      await screen.findByText('Nada mudou: não há alterações para salvar.'),
    ).toBeInTheDocument();
    expect(api.requests).toEqual([]);
    expect(currentUrl()).toBe(`/orders/${ORDER.id}/edit`);
  });

  it('operador: prioridade e prazo desabilitados com a explicação; envia só a descrição', async () => {
    const api = await openEdit(USER);
    for (const label of ['Prioridade', 'Prazo']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
        'Somente supervisor altera prioridade e prazo.',
      );
    }
    await userEvent.clear(screen.getByLabelText('Descrição (opcional)'));
    await save();

    await screen.findByText('Alterações salvas.');
    // Descrição apagada vira null (limpa). Prioridade e prazo nunca entram no PATCH.
    expect(api.requests[0]?.body).toEqual({ description: null });
  });

  it('409 ao salvar mostra a mensagem pelo code e mantém o que foi digitado', async () => {
    await openEdit(SUPERVISOR);
    server.use(
      http.patch(`/api/work-orders/${ORDER.id}`, () => errorBody(409, 'CONCURRENT_UPDATE')),
    );
    await userEvent.clear(screen.getByLabelText('Título'));
    await userEvent.type(screen.getByLabelText('Título'), 'Meu texto novo');
    await save();

    expect(await screen.findByText(ERROR_MESSAGES.CONCURRENT_UPDATE)).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Meu texto novo');
    expect(currentUrl()).toBe(`/orders/${ORDER.id}/edit`);
  });

  it('403 ao salvar mostra a mensagem de permissão sem perder o texto', async () => {
    await openEdit(USER);
    server.use(http.patch(`/api/work-orders/${ORDER.id}`, () => errorBody(403, 'FORBIDDEN')));
    await userEvent.type(screen.getByLabelText('Título'), ' 2');
    await save();

    expect(await screen.findByText(ERROR_MESSAGES.FORBIDDEN)).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Trocar filtro 2');
  });

  it('ordem finalizada: mensagem no lugar do formulário', async () => {
    mockOrderApi({ ...ORDER, status: 'DONE' });
    renderAppAs(SUPERVISOR, `/orders/${ORDER.id}/edit`);

    expect(
      await screen.findByText('Esta ordem está concluída e não pode mais ser editada.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });

  it('operador que não é o responsável: mensagem no lugar do formulário', async () => {
    mockOrderApi({ ...ORDER, assignee: { id: OTHER_OPERATOR.id, name: OTHER_OPERATOR.name } });
    renderAppAs(USER, `/orders/${ORDER.id}/edit`);

    expect(await screen.findByText('Você não pode editar esta ordem.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });
});
