import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';
import type { components } from '../../lib/api-types';
import { useAuth } from '../auth/auth-context';

export type UserSummary = components['schemas']['UserSummaryDto'];

/** Usuários para escolher o responsável. Só supervisor: para operador a API responde 403. */
export function useUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => apiGet<UserSummary[]>('/users', signal),
    enabled: user?.role === 'SUPERVISOR',
    // A lista de usuários quase não muda durante o uso.
    staleTime: 5 * 60 * 1000,
  });
}
