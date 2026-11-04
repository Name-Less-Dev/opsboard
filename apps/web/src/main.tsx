import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import { App } from './App';
import { AppProviders } from './AppProviders';
import { createQueryClient } from './lib/query-client';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado no index.html');
}

const queryClient = createQueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders client={queryClient}>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
