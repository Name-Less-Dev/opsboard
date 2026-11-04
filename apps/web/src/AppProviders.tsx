import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { AuthProvider } from './features/auth/AuthProvider';
import { useAuth } from './features/auth/auth-context';

// Ao sair (ou cair a sessão), descarta o cache: o próximo usuário não vê dados do anterior,
// como o resultado de "Minhas ordens".
function ClearCacheOnLogout() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status === 'anonymous') queryClient.clear();
  }, [status, queryClient]);
  return null;
}

export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ClearCacheOnLogout />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
