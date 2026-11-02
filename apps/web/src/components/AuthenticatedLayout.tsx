import { Outlet } from 'react-router';
import { useAuth, type Role } from '../features/auth/auth-context';

const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: 'Operador',
  SUPERVISOR: 'Supervisor',
};

export function AuthenticatedLayout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="app-header">
        <strong>OpsBoard</strong>
        {user && (
          <div className="app-header-user">
            <span>
              {user.name} ({ROLE_LABELS[user.role]})
            </span>
            <button type="button" onClick={logout}>
              Sair
            </button>
          </div>
        )}
      </header>
      <Outlet />
    </>
  );
}
