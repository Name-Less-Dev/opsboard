import { NavLink, Outlet } from 'react-router';
import { useAuth, type Role } from '../features/auth/auth-context';
import { Button } from './Button';
import { ThemeToggle } from './ThemeToggle';

const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: 'Operador',
  SUPERVISOR: 'Supervisor',
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-control px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-surface-muted text-text' : 'text-muted hover:bg-surface-muted hover:text-text'
  }`;

export function AuthenticatedLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-1 px-gutter py-2">
          <span className="text-lg font-semibold">OpsBoard</span>

          <nav aria-label="Principal">
            <ul className="flex gap-1">
              <li>
                <NavLink to="/orders" className={navLinkClass}>
                  Ordens
                </NavLink>
              </li>
            </ul>
          </nav>

          {/* No celular o nome desce para a segunda linha; ele não recebe foco, então a ordem
              do teclado continua igual à visual. */}
          {user && (
            <p
              className="order-last w-full truncate text-sm sm:order-none sm:ml-auto sm:w-auto"
              title={`${user.name} (${ROLE_LABELS[user.role]})`}
            >
              <span className="font-medium">{user.name}</span>{' '}
              <span className="text-muted">({ROLE_LABELS[user.role]})</span>
            </p>
          )}

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <ThemeToggle />
            <Button size="sm" onClick={logout}>
              Sair
            </Button>
          </div>
        </div>
      </header>
      <div
        id="conteudo"
        tabIndex={-1}
        className="mx-auto max-w-content px-gutter py-6 outline-none"
      >
        <Outlet />
      </div>
    </div>
  );
}
