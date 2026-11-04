import { useTheme } from '../lib/use-theme';

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
      <path d="M17.3 13.3A8 8 0 0 1 6.7 2.7a8 8 0 1 0 10.6 10.6Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === 'dark' ? 'Tema claro' : 'Tema escuro';

  return (
    // O nome do botão diz o que ele faz ("Tema escuro"); no celular só o ícone aparece.
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
      className="inline-flex items-center gap-2 rounded-control border border-control-border px-2.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      <span className="hidden md:inline">{nextLabel}</span>
    </button>
  );
}
