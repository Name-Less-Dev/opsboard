import { useCallback, useState } from 'react';
import { applyTheme, initialTheme, saveTheme, type Theme } from './theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
