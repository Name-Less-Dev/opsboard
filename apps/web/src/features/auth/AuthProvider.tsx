import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setUnauthorizedHandler } from '../../lib/api';
import { clearToken, getToken, setToken } from '../../lib/session';
import { AuthContext, type AuthState, type AuthUser } from './auth-context';

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

const ANONYMOUS: AuthState = { status: 'anonymous', user: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    getToken() ? { status: 'loading', user: null } : ANONYMOUS,
  );

  useEffect(() => {
    setUnauthorizedHandler(() => setState(ANONYMOUS));
    return () => setUnauthorizedHandler(() => {});
  }, []);

  // Restaura a sessão ao recarregar: o token salvo só vale se a API ainda aceitar.
  useEffect(() => {
    if (!getToken()) return;
    const controller = new AbortController();

    apiGet<AuthUser>('/auth/me', controller.signal)
      .then((user) => setState({ status: 'authenticated', user }))
      .catch(() => {
        if (controller.signal.aborted) return;
        // Se foi 401, o cliente HTTP já limpou o token. Em outras falhas (API fora do ar) o
        // token fica guardado, para a sessão voltar ao recarregar quando a API normalizar.
        setState(ANONYMOUS);
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, user } = await apiPost<LoginResponse>('/auth/login', { email, password });
    setToken(accessToken);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState(ANONYMOUS);
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
