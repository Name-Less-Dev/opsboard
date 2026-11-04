import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '../lib/api';

type HealthResponse = {
  status: 'ok';
  database: 'up';
};

type HealthState = { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; message: string };

function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.statusCode})`;
  if (error instanceof Error) return error.message;
  return 'Erro desconhecido';
}

export function HomePage() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    // Cancela a requisição se o componente desmontar (o StrictMode monta duas vezes em dev).
    const controller = new AbortController();

    apiGet<HealthResponse>('/health', controller.signal)
      .then(() => setHealth({ kind: 'ok' }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({ kind: 'error', message: describeError(error) });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="home">
      <h1>OpsBoard</h1>
      <p className="subtitle">Painel de ordens de serviço</p>

      {health.kind === 'loading' && <p className="status">Verificando a API…</p>}
      {health.kind === 'ok' && <p className="status status-ok">API ok</p>}
      {health.kind === 'error' && (
        <p className="status status-error" role="alert">
          API com erro: {health.message}
        </p>
      )}
    </main>
  );
}
