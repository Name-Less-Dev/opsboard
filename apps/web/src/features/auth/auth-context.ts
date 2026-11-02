import { createContext, useContext } from 'react';

export type Role = 'OPERATOR' | 'SUPERVISOR';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// "loading" é a checagem do token salvo ao abrir a página. Sem esse estado, a rota protegida
// mandaria para /login por um instante, mesmo com sessão válida.
export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'anonymous'; user: null };

export type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  }
  return value;
}
