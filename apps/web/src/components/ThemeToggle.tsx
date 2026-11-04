import { useTheme } from '../lib/use-theme';

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
      <path d="M10 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-5a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM5 9a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2h1Zm5 6a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Z" />
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
      className="inline-flex items-center gap-2 rounded-control border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-surface-muted"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      <span className="hidden md:inline">{nextLabel}</span>
    </button>
  );
}
