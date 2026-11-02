import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../features/auth/auth-context';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <p role="status">Carregando…</p>;
  }
  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <Outlet />;
}
