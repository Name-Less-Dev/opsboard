import { vi } from 'vitest';

export type ImportCall = {
  dryRun: string | null;
  file: File | null;
  /** O header enviado pelo cliente; precisa ser null (quem monta o multipart é o navegador). */
  contentType: string | null;
};

/**
 * Atende `POST /api/work-orders/import` sem passar pelo MSW. No ambiente de teste, o `FormData`
 * do jsdom não atravessa o `fetch` do Node usado pelo MSW (a requisição sai com Content-Length
 * errado e falha). Aqui o `FormData` é lido direto, no mesmo processo; o resto das chamadas
 * segue para o `fetch` de antes (o do MSW). O envio real é conferido no navegador.
 */
export function mockImportApi(respond: (call: ImportCall) => Response | Promise<Response>) {
  const calls: ImportCall[] = [];
  const previousFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api/work-orders/import')) return previousFetch(input, init);

    const body = init?.body;
    const file = body instanceof FormData ? body.get('file') : null;
    const call: ImportCall = {
      dryRun: new URL(url, 'http://localhost').searchParams.get('dryRun'),
      file: file instanceof File ? file : null,
      contentType: new Headers(init?.headers).get('Content-Type'),
    };
    calls.push(call);
    return Promise.resolve(respond(call));
  });
  return calls;
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-teste-123' },
  });
