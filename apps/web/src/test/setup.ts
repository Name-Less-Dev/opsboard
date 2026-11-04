import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { clearToken } from '../lib/session';

// O jsdom não implementa rolagem; a tela chama scrollIntoView ao trocar de página.
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  value: () => {},
  configurable: true,
  writable: true,
});

// Sem `globals: true` no Vitest, a limpeza automática do Testing Library não é registrada.
afterEach(() => {
  cleanup();
  clearToken();
  vi.unstubAllGlobals();
});
