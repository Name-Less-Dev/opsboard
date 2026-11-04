import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { AppProviders } from '../AppProviders';
import type { AuthUser } from '../features/auth/auth-context';
import { createQueryClient } from '../lib/query-client';
import { setToken } from '../lib/session';
import { server } from './api-mock';
import { CurrentUrl } from './CurrentUrl';

/** App inteiro (rotas, providers, cliente HTTP reais) logado como `user`, abrindo em `path`. */
export function renderAppAs(user: AuthUser, path: string) {
  setToken('token-de-teste');
  server.use(http.get('/api/auth/me', () => HttpResponse.json(user)));
  const client = createQueryClient();
  // Mesma política de retry do app, sem a espera entre as tentativas.
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders client={client}>
        <App />
        <CurrentUrl />
      </AppProviders>
    </MemoryRouter>,
  );
}

export const currentUrl = () => screen.getByLabelText('url').textContent;
