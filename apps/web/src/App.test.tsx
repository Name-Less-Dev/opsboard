import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { getToken, setToken } from './lib/session';

const user = { id: '1', name: 'Ana Operadora', email: 'ana@opsboard.dev', role: 'OPERATOR' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// Só a rede é falsa: roteador, contexto, cliente HTTP e telas são os reais.
function mockApi(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn((path: string, _init?: RequestInit) => {
    const handler = routes[path];
    return Promise.resolve(handler ? handler() : json({ message: 'Não encontrado' }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="url">{`${location.pathname}${location.search}`}</output>;
}

function renderApp(initialPath: string) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
        <CurrentUrl />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(email: string, password: string) {
  const actor = userEvent.setup();
  await actor.type(screen.getByLabelText('E-mail'), email);
  // {Enter} no campo: garante que o formulário envia pelo teclado.
  await actor.type(screen.getByLabelText('Senha'), `${password}{Enter}`);
}

describe('Autenticação', () => {
  it('rota protegida sem sessão redireciona para /login', () => {
    mockApi({});
    renderApp('/');

    expect(screen.getByRole('form', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByLabelText('url')).toHaveTextContent('/login');
  });

  it('login com sucesso volta para a página pedida e guarda o token', async () => {
    mockApi({
      '/api/auth/login': () => json({ accessToken: 'token-valido', user }),
      '/api/health': () => json({ status: 'ok', database: 'up' }),
    });
    renderApp('/?filtro=1');

    await fillAndSubmit('ana@opsboard.dev', 'opsboard123');

    expect(await screen.findByText('Ana Operadora (Operador)')).toBeInTheDocument();
    expect(screen.getByLabelText('url')).toHaveTextContent('/?filtro=1');
    expect(getToken()).toBe('token-valido');
  });

  it('login com erro mostra a mensagem e continua na tela de login', async () => {
    mockApi({
      '/api/auth/login': () => json({ message: 'Credenciais inválidas' }, 401),
    });
    renderApp('/login');

    await fillAndSubmit('ana@opsboard.dev', 'errada');

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais inválidas.');
    expect(screen.getByLabelText('url')).toHaveTextContent('/login');
    expect(getToken()).toBeNull();
    // O foco volta para a senha, e o botão sai do estado de carregamento.
    expect(screen.getByLabelText('Senha')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('valida campos vazios sem chamar a API', async () => {
    const fetchMock = mockApi({});
    renderApp('/login');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restaura a sessão ao recarregar, chamando /auth/me com o token salvo', async () => {
    setToken('token-salvo');
    const fetchMock = mockApi({
      '/api/auth/me': () => json(user),
      '/api/health': () => json({ status: 'ok', database: 'up' }),
    });
    renderApp('/');

    expect(await screen.findByText('Ana Operadora (Operador)')).toBeInTheDocument();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-salvo');
  });

  it('token recusado com 401 limpa a sessão e leva ao /login', async () => {
    setToken('token-vencido');
    mockApi({
      '/api/auth/me': () => json({ message: 'Unauthorized' }, 401),
    });
    renderApp('/');

    expect(await screen.findByRole('form', { name: 'Entrar' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it('sair limpa a sessão e leva ao /login', async () => {
    setToken('token-salvo');
    mockApi({
      '/api/auth/me': () => json(user),
      '/api/health': () => json({ status: 'ok', database: 'up' }),
    });
    renderApp('/');

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(screen.getByLabelText('url')).toHaveTextContent('/login'));
    expect(getToken()).toBeNull();
  });
});
