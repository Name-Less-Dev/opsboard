import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { WorkOrderStatus } from '../features/work-orders/labels';
import { ERROR_MESSAGES } from '../lib/error-messages';
import { errorBody, makeOrder, OTHER_OPERATOR, server, SUPERVISOR, USER } from '../test/api-mock';
import { mockOrderApi } from '../test/order-api-mock';
import { currentUrl, renderAppAs } from '../test/render-app';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ANA = { id: USER.id, name: USER.name };
const orderFor = (status: WorkOrderStatus, assignee: { id: string; name: string } | null = ANA) =>
  makeOrder({ title: 'Trocar filtro', status, assignee });

async function openDetail(user = USER, order = orderFor('OPEN')) {
  const api = mockOrderApi(order);
  renderAppAs(user, `/orders/${order.id}`);
  await screen.findByRole('heading', { level: 1, name: order.title });
  return { api, order };
}

const actionNames = () => {
  const group = screen.queryByRole('group', { name: 'Ações da ordem' });
  return group ? [...group.querySelectorAll('a, button')].map((el) => el.textContent) : [];
};
// A página tem um <dialog> por confirmação; o aberto é o que interessa.
const dialog = () => document.querySelector('dialog[open]') as HTMLDialogElement;
const anyDialogOpen = () => document.querySelector('dialog[open]') !== null;

describe('Detalhe da ordem: ações por perfil', () => {
  it('mostra os dados da ordem', async () => {
    await openDetail(
      USER,
      makeOrder({ title: 'Trocar filtro', description: 'Sala 2', assignee: null }),
    );
    expect(screen.getByText('Sala 2')).toBeInTheDocument();
    expect(screen.getByText('Sem responsável')).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
    for (const label of ['Prazo', 'Criada por', 'Criada em', 'Atualizada em']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each<[string, WorkOrderStatus, boolean, string[]]>([
    ['operador responsável, aberta', 'OPEN', true, ['Editar ordem', 'Iniciar ordem']],
    ['operador responsável, em andamento', 'IN_PROGRESS', true, ['Editar ordem', 'Concluir ordem']],
    ['operador em ordem de outro', 'OPEN', false, []],
    ['operador em ordem de outro, em andamento', 'IN_PROGRESS', false, []],
  ])('%s', async (_name, status, isAssignee, expected) => {
    const assignee = isAssignee ? ANA : { id: OTHER_OPERATOR.id, name: OTHER_OPERATOR.name };
    await openDetail(USER, orderFor(status, assignee));
    expect(actionNames()).toEqual(expected);
    expect(screen.queryByRole('form', { name: 'Atribuir responsável' })).not.toBeInTheDocument();
  });

  it('supervisor vê todas as ações numa ordem ativa', async () => {
    await openDetail(SUPERVISOR, orderFor('OPEN'));
    expect(actionNames()).toEqual([
      'Editar ordem',
      'Iniciar ordem',
      'Cancelar ordem',
      'Excluir ordem',
    ]);
    expect(await screen.findByRole('form', { name: 'Atribuir responsável' })).toBeInTheDocument();
  });

  it.each<[string, WorkOrderStatus]>([
    ['concluída', 'DONE'],
    ['cancelada', 'CANCELLED'],
  ])('ordem %s: somente leitura, sem ações para o operador', async (label, status) => {
    await openDetail(USER, orderFor(status));
    expect(actionNames()).toEqual([]);
    expect(screen.getByText(new RegExp(`está ${label} e é somente leitura`))).toBeInTheDocument();
  });

  it('ordem finalizada: supervisor só pode excluir', async () => {
    await openDetail(SUPERVISOR, orderFor('DONE'));
    expect(actionNames()).toEqual(['Excluir ordem']);
    expect(screen.queryByRole('form', { name: 'Atribuir responsável' })).not.toBeInTheDocument();
  });
});

describe('Detalhe da ordem: mudar status', () => {
  it('iniciar e concluir enviam a requisição certa e a tela mostra o novo status', async () => {
    const { api, order } = await openDetail(USER, orderFor('OPEN'));

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar ordem' }));

    expect(await screen.findByText('Ordem iniciada.')).toBeInTheDocument();
    expect(api.requests).toEqual([
      {
        method: 'PATCH',
        path: `/api/work-orders/${order.id}/status`,
        body: { status: 'IN_PROGRESS' },
      },
    ]);
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();

    await userEvent.click(await screen.findByRole('button', { name: 'Concluir ordem' }));

    expect(await screen.findByText('Ordem concluída.')).toBeInTheDocument();
    expect(api.requests.at(-1)?.body).toEqual({ status: 'DONE' });
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(actionNames()).toEqual([]);
  });

  it('409 mostra a mensagem do code e busca o detalhe de novo', async () => {
    const { order } = await openDetail(USER, orderFor('OPEN'));
    let detailRequests = 0;
    server.use(
      http.patch(`/api/work-orders/${order.id}/status`, () => errorBody(409, 'INVALID_TRANSITION')),
      // Outra aba já concluiu a ordem: é o que o detalhe busca de novo.
      http.get(`/api/work-orders/${order.id}`, () => {
        detailRequests += 1;
        return HttpResponse.json({ ...order, status: 'DONE' });
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar ordem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGES.INVALID_TRANSITION);
    await waitFor(() => expect(screen.getByText('Concluída')).toBeInTheDocument());
    expect(detailRequests).toBeGreaterThanOrEqual(1);
    expect(actionNames()).toEqual([]);
  });

  it('403 mostra a mensagem de permissão', async () => {
    const { order } = await openDetail(USER, orderFor('OPEN'));
    server.use(
      http.patch(`/api/work-orders/${order.id}/status`, () => errorBody(403, 'FORBIDDEN')),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar ordem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGES.FORBIDDEN);
    expect(screen.getByText('Aberta')).toBeInTheDocument();
  });

  it('cancelar exige confirmação: "Voltar" e Esc não chamam a API', async () => {
    const { api, order } = await openDetail(SUPERVISOR, orderFor('IN_PROGRESS'));
    const cancelButton = screen.getByRole('button', { name: 'Cancelar ordem' });

    await userEvent.click(cancelButton);
    expect(anyDialogOpen()).toBe(true);
    expect(within(dialog()).getByRole('button', { name: 'Voltar' })).toHaveFocus();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Voltar' }));
    expect(anyDialogOpen()).toBe(false);
    expect(cancelButton).toHaveFocus();

    await userEvent.click(cancelButton);
    // Esc: o navegador dispara `cancel` no <dialog>.
    fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    expect(anyDialogOpen()).toBe(false);
    expect(api.requests).toEqual([]);

    await userEvent.click(cancelButton);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar ordem' }));

    expect(await screen.findByText('Ordem cancelada.')).toBeInTheDocument();
    expect(api.requests).toEqual([
      {
        method: 'PATCH',
        path: `/api/work-orders/${order.id}/status`,
        body: { status: 'CANCELLED' },
      },
    ]);
    // O botão de origem sumiu (ordem final): o foco vai para o título.
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('Detalhe da ordem: atribuir e excluir', () => {
  it('supervisor atribui escolhendo o usuário', async () => {
    const { api, order } = await openDetail(SUPERVISOR, orderFor('OPEN'));
    const form = within(await screen.findByRole('form', { name: 'Atribuir responsável' }));
    const submit = form.getByRole('button', { name: 'Atribuir responsável' });
    expect(submit).toBeDisabled();

    await waitFor(() => expect(form.getByLabelText('Novo responsável')).toBeEnabled());
    await userEvent.selectOptions(
      form.getByLabelText('Novo responsável'),
      'Bruno Operador (Operador)',
    );
    await userEvent.click(submit);

    expect(await screen.findByText('Responsável atualizado.')).toBeInTheDocument();
    expect(api.requests).toEqual([
      {
        method: 'PATCH',
        path: `/api/work-orders/${order.id}/assignee`,
        body: { assigneeId: OTHER_OPERATOR.id },
      },
    ]);
    expect(screen.getByText('Bruno Operador', { selector: 'dd' })).toBeInTheDocument();
  });

  it('excluir exige confirmação e volta para a lista com aviso', async () => {
    const { api, order } = await openDetail(SUPERVISOR, orderFor('DONE'));

    await userEvent.click(screen.getByRole('button', { name: 'Excluir ordem' }));
    expect(within(dialog()).getByText(/junto com todo o histórico/)).toBeInTheDocument();
    fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir ordem' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Voltar' }));
    expect(api.requests).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir ordem' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Excluir ordem' }));

    expect(await screen.findByText('Ordem excluída.')).toBeInTheDocument();
    expect(currentUrl()).toBe('/orders');
    expect(api.requests).toEqual([
      { method: 'DELETE', path: `/api/work-orders/${order.id}`, body: null },
    ]);
    expect(
      await screen.findByText('Nenhuma ordem de serviço cadastrada ainda.'),
    ).toBeInTheDocument();
  });
});

describe('Detalhe da ordem: estados', () => {
  it('404 mostra "não encontrada" com link para a lista', async () => {
    const id = '00000000-0000-4000-8000-999999999999';
    server.use(http.get(`/api/work-orders/${id}`, () => errorBody(404, 'NOT_FOUND')));
    renderAppAs(USER, `/orders/${id}`);

    expect(await screen.findByText('Ordem não encontrada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para a lista de ordens' })).toHaveAttribute(
      'href',
      '/orders',
    );
  });

  it('carregando mostra o skeleton, e erro inesperado tem "Tentar de novo"', async () => {
    const order = orderFor('OPEN');
    let fail = true;
    server.use(
      http.get(`/api/work-orders/${order.id}`, () =>
        fail ? errorBody(500, 'INTERNAL_ERROR', 'req-detalhe') : HttpResponse.json(order),
      ),
    );
    renderAppAs(USER, `/orders/${order.id}`);

    expect(await screen.findByText('Carregando ordem…')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('req-detalhe');

    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trocar filtro' }),
    ).toBeInTheDocument();
  });
});
