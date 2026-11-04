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

// O jsdom não implementa `showModal`/`close` do <dialog>. Este mínimo imita o navegador no
// que a tela usa: o atributo `open` e o evento `close`. O Esc é simulado nos testes com o
// evento `cancel`, que é o que o navegador dispara.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  },
  close: {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  },
});

// Sem `globals: true` no Vitest, a limpeza automática do Testing Library não é registrada.
afterEach(() => {
  cleanup();
  clearToken();
  vi.unstubAllGlobals();
});
