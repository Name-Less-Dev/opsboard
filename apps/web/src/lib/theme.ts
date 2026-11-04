// Tema claro/escuro. O tema inicial é aplicado por um script no index.html, antes do React,
// para a página não abrir clara e trocar para escura um instante depois. Este módulo cuida
// da troca pelo botão. A chave do localStorage é a mesma do script.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'opsboard.theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Escolha salva; sem escolha, a preferência do sistema. */
export function initialTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sem persistência: o tema vale até recarregar.
  }
}
