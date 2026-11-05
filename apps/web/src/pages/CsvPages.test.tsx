import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImportReport } from '../features/work-orders/csv/csv-types';
import { ERROR_MESSAGES } from '../lib/error-messages';
import { getToken } from '../lib/session';
import { makeOrder, makePage, mockWorkOrders, server, SUPERVISOR, USER } from '../test/api-mock';
import { jsonResponse, mockImportApi } from '../test/import-api-mock';
import { currentUrl, renderAppAs } from '../test/render-app';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// `applyAccept: false`: o teste escolhe arquivos fora do `accept`, como o "Todos os arquivos"
// do seletor do sistema permite; a validação da tela é que precisa recusar.
const setupUser = () => userEvent.setup({ applyAccept: false });

/** Intercepta o link temporário do download: guarda o nome e o Blob. */
function captureDownloads() {
  const blobs = new Map<string, Blob>();
  let counter = 0;
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      const url = `blob:teste/${++counter}`;
      blobs.set(url, blob);
      return url;
    }),
    revokeObjectURL: vi.fn(),
  });
  const saved: { filename: string; blob: Blob | undefined }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ filename: this.download, blob: blobs.get(this.href) });
  });
  return saved;
}

const csv = (name = 'ordens.csv', content = 'title;priority\r\nAbc;LOW\r\n') =>
  new File([content], name, { type: 'text/csv' });

const report = (changes: Partial<ImportReport> = {}): ImportReport => ({
  dryRun: true,
  valid: true,
  totalRows: 2,
  validRows: 2,
  totalErrors: 0,
  errors: [],
  ...changes,
});

const INVALID_REPORT = report({
  valid: false,
  totalRows: 120,
  validRows: 118,
  totalErrors: 2,
  errors: [
    { row: 3, column: 'title', code: 'TOO_SHORT', message: 'texto da API' },
    { row: 7, column: 'priority', code: 'INVALID_ENUM', message: 'texto da API' },
  ],
});

const fileInput = () => screen.getByLabelText('Arquivo CSV');
const validateButton = () => screen.getByRole('button', { name: /Validar arquivo|Validando/ });
const importButton = () => screen.getByRole('button', { name: /^Importar/ });

async function openImport() {
  renderAppAs(SUPERVISOR, '/orders/import');
  return screen.findByRole('heading', { level: 1, name: 'Importar ordens' });
}

describe('Exportar CSV na lista', () => {
  it('usa os filtros da URL sem paginação, mostra carregando e baixa com o nome do cabeçalho', async () => {
    const saved = captureDownloads();
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder(), makeOrder()])));
    const exports: URLSearchParams[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('/api/work-orders/export', async ({ request }) => {
        exports.push(new URL(request.url).searchParams);
        await gate;
        return new HttpResponse('id;title', {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="opsboard-ordens-20261105-1430.csv"',
          },
        });
      }),
    );
    const user = setupUser();
    renderAppAs(USER, '/orders?status=OPEN&priority=HIGH,URGENT&q=filtro&page=2&pageSize=10');

    const button = await screen.findByRole('button', { name: 'Exportar CSV' });
    await waitFor(() =>
      expect(button).toHaveAccessibleDescription('Exporta os 2 resultados filtrados'),
    );
    await user.click(button);

    const busy = await screen.findByRole('button', { name: 'Exportando…' });
    expect(busy).toBeDisabled();
    release();
    await screen.findByRole('button', { name: 'Exportar CSV' });

    expect(Object.fromEntries(exports[0])).toEqual({
      q: 'filtro',
      status: 'OPEN',
      priority: 'HIGH,URGENT',
      sortBy: 'createdAt',
      order: 'desc',
    });
    expect(saved.map((item) => item.filename)).toEqual(['opsboard-ordens-20261105-1430.csv']);
  });

  it('EXPORT_TOO_LARGE mostra a mensagem do code e nada é baixado', async () => {
    const saved = captureDownloads();
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    server.use(
      http.get('/api/work-orders/export', () =>
        HttpResponse.json(
          { statusCode: 422, code: 'EXPORT_TOO_LARGE', message: 'texto da API', requestId: 'r' },
          { status: 422 },
        ),
      ),
    );
    const user = setupUser();
    renderAppAs(USER, '/orders');
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGES.EXPORT_TOO_LARGE);
    expect(saved).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });

  it('401 na exportação derruba a sessão e leva ao login', async () => {
    captureDownloads();
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    server.use(
      http.get('/api/work-orders/export', () =>
        HttpResponse.json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'x' }, { status: 401 }),
      ),
    );
    const user = setupUser();
    renderAppAs(USER, '/orders');
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(currentUrl()).toBe('/login'));
    expect(getToken()).toBeNull();
  });

  it('lista vazia: botão desabilitado, com o motivo', async () => {
    mockWorkOrders(() => HttpResponse.json(makePage([])));
    renderAppAs(USER, '/orders?status=DONE');
    const button = await screen.findByRole('button', { name: 'Exportar CSV' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleDescription('Nenhum resultado para exportar');
  });
});

describe('quem vê a importação', () => {
  it('supervisor vê "Importar CSV" na lista, que leva à tela', async () => {
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    const user = setupUser();
    renderAppAs(SUPERVISOR, '/orders');
    await user.click(await screen.findByRole('link', { name: 'Importar CSV' }));
    expect(currentUrl()).toBe('/orders/import');
    expect(await screen.findByLabelText('Arquivo CSV')).toBeInTheDocument();
  });

  it('operador não vê o botão', async () => {
    mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    renderAppAs(USER, '/orders');
    await screen.findByRole('button', { name: 'Exportar CSV' });
    expect(screen.queryByRole('link', { name: 'Importar CSV' })).not.toBeInTheDocument();
  });

  it('operador que abre a URL vê acesso negado, sem formulário', async () => {
    const calls = mockImportApi(() => jsonResponse(report()));
    renderAppAs(USER, '/orders/import');
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado');
    expect(screen.getByText(/Somente supervisores podem importar/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Arquivo CSV')).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe('Tela de importação (/orders/import)', () => {
  it('estado inicial: nenhum arquivo, importar desabilitado', async () => {
    await openImport();
    expect(screen.getByText(/Nenhum arquivo escolhido/)).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
    expect(screen.getByText('Valide o arquivo para liberar a importação.')).toBeInTheDocument();
  });

  it.each([
    ['extensão errada', csv('ordens.xlsx'), /extensão \.csv/],
    ['acima de 1 MB', new File([new Uint8Array(1024 * 1024 + 1)], 'grande.csv'), /1 MB/],
  ])('%s é recusado sem chamar a API', async (_label, file, message) => {
    const calls = mockImportApi(() => jsonResponse(report()));
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), file);

    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    expect(fileInput()).toHaveAccessibleDescription(message);
    await user.click(validateButton());
    expect(calls).toHaveLength(0);
  });

  it('validar mostra o resumo e a tabela de erros; com erros, importar fica desabilitado', async () => {
    const calls = mockImportApi(() => jsonResponse(INVALID_REPORT));
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    expect(screen.getByText('Arquivo escolhido: ordens.csv (25 bytes)')).toBeInTheDocument();
    await user.click(validateButton());

    const summary = await screen.findByRole('heading', {
      name: 'Arquivo com erros: 120 linhas, 118 válidas, 2 com erro.',
    });
    expect(summary).toHaveFocus();
    expect(calls).toEqual([expect.objectContaining({ dryRun: 'true', contentType: null })]);

    const table = screen.getByRole('table', { name: 'Erros por linha do arquivo' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '3títuloUse pelo menos 3 caracteres.',
      '7prioridadeUse Baixa, Média, Alta ou Urgente.',
    ]);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Linha', 'Coluna', 'Mensagem']);
    expect(importButton()).toBeDisabled();
    expect(screen.getByText(/Corrija os erros no arquivo/)).toBeInTheDocument();
  });

  it('mais erros do que os 100 mostrados: aviso com o total', async () => {
    const errors = Array.from({ length: 100 }, (_, index) => ({
      row: index + 2,
      column: 'priority' as const,
      code: 'INVALID_ENUM' as const,
      message: 'x',
    }));
    mockImportApi(() =>
      jsonResponse(
        report({ valid: false, totalRows: 150, validRows: 0, totalErrors: 150, errors }),
      ),
    );
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());

    expect(await screen.findByText(/Mostrando os primeiros 100 de 150 erros/)).toBeInTheDocument();
  });

  it('relatório válido libera "Importar N ordens"; trocar o arquivo desabilita de novo', async () => {
    mockImportApi(() => jsonResponse(report()));
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());

    await screen.findByRole('heading', {
      name: 'Arquivo válido: 2 linhas, 2 válidas, 0 com erro.',
    });
    expect(screen.getByRole('button', { name: 'Importar 2 ordens' })).toBeEnabled();

    await user.upload(fileInput(), csv('outro.csv'));
    expect(importButton()).toBeDisabled();
    expect(screen.queryByRole('heading', { name: /Arquivo válido/ })).not.toBeInTheDocument();
  });

  it('importação válida envia dryRun=false, volta para a lista com a mensagem e a lista é buscada de novo', async () => {
    const listRequests = mockWorkOrders(() => HttpResponse.json(makePage([makeOrder()])));
    const calls = mockImportApi(({ dryRun }) =>
      dryRun === 'true'
        ? jsonResponse(report())
        : jsonResponse({ dryRun: false, imported: 2 }, 201),
    );
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());
    await user.click(await screen.findByRole('button', { name: 'Importar 2 ordens' }));

    await waitFor(() => expect(currentUrl()).toBe('/orders'));
    expect(await screen.findByText('2 ordens importadas.')).toBeInTheDocument();
    expect(calls.map((call) => call.dryRun)).toEqual(['true', 'false']);
    expect(calls[1].file?.name).toBe('ordens.csv');
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));
  });

  it('envio duplo é impedido: dois cliques, uma importação', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockWorkOrders(() => HttpResponse.json(makePage([])));
    const calls = mockImportApi(async ({ dryRun }) => {
      if (dryRun === 'true') return jsonResponse(report());
      await gate;
      return jsonResponse({ dryRun: false, imported: 2 }, 201);
    });
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());
    const button = await screen.findByRole('button', { name: 'Importar 2 ordens' });
    await user.click(button);
    await user.click(button);

    const busy = await screen.findByRole('button', { name: 'Importando…' });
    expect(busy).toBeDisabled();
    expect(validateButton()).toBeDisabled();
    release();
    await waitFor(() => expect(currentUrl()).toBe('/orders'));
    expect(calls.filter((call) => call.dryRun === 'false')).toHaveLength(1);
  });

  it('422 IMPORT_INVALID na importação mostra o mesmo relatório, sem sair da tela', async () => {
    mockImportApi(({ dryRun }) =>
      dryRun === 'true'
        ? jsonResponse(report())
        : jsonResponse(
            {
              statusCode: 422,
              code: 'IMPORT_INVALID',
              message: 'texto da API',
              details: [
                { row: 4, column: 'assigneeEmail', code: 'UNKNOWN_ASSIGNEE', message: 'x' },
              ],
              totalErrors: 1,
              requestId: 'r',
            },
            422,
          ),
    );
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());
    await user.click(await screen.findByRole('button', { name: 'Importar 2 ordens' }));

    const summary = await screen.findByRole('heading', {
      name: 'Nada foi importado: o arquivo tem 1 erro.',
    });
    expect(summary).toHaveFocus();
    const table = screen.getByRole('table', { name: 'Erros por linha do arquivo' });
    expect(table).toHaveTextContent('4e-mail do responsávelNenhum usuário com este e-mail.');
    expect(currentUrl()).toBe('/orders/import');
  });

  it('400 IMPORT_FILE_INVALID mostra a mensagem da API em destaque', async () => {
    mockImportApi(() =>
      jsonResponse(
        {
          statusCode: 400,
          code: 'IMPORT_FILE_INVALID',
          message: 'Faltam colunas obrigatórias no cabeçalho: priority.',
          requestId: 'r',
        },
        400,
      ),
    );
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'O arquivo não pode ser importado. Faltam colunas obrigatórias no cabeçalho: priority.',
    );
    expect(alert).not.toHaveTextContent('Código para o suporte');
    expect(importButton()).toBeDisabled();
  });

  it('erro inesperado mostra a mensagem padrão e o requestId', async () => {
    mockImportApi(() =>
      jsonResponse(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'x', requestId: 'req-falha-42' },
        500,
      ),
    );
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.INTERNAL_ERROR);
    expect(alert).toHaveTextContent('req-falha-42');
  });

  it('PAYLOAD_TOO_LARGE da API (limite do servidor) aparece pela mensagem do code', async () => {
    mockImportApi(() =>
      jsonResponse(
        { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'x', requestId: 'r' },
        413,
      ),
    );
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGES.PAYLOAD_TOO_LARGE);
  });

  it('"Baixar modelo" baixa o CSV com BOM, cabeçalho e `;`, sem chamar a API', async () => {
    const saved = captureDownloads();
    const calls = mockImportApi(() => jsonResponse(report()));
    const user = setupUser();
    await openImport();
    await user.click(screen.getByRole('button', { name: 'Baixar modelo' }));

    expect(saved[0].filename).toBe('opsboard-modelo-importacao.csv');
    const bytes = new Uint8Array(await (saved[0].blob as Blob).arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.subarray(3))).toMatch(
      /^title;description;priority;dueDate;assigneeEmail\r\n/,
    );
    expect(calls).toHaveLength(0);
  });

  it('o resultado fica numa região aria-live e a tabela rola no próprio contêiner, com foco', async () => {
    mockImportApi(() => jsonResponse(INVALID_REPORT));
    const user = setupUser();
    await openImport();
    await user.upload(fileInput(), csv());
    await user.click(validateButton());

    const summary = await screen.findByRole('heading', { name: /Arquivo com erros/ });
    expect(summary.closest('[aria-live="polite"]')).not.toBeNull();
    const region = screen.getByRole('region', { name: 'Erros por linha do arquivo' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.className).toContain('overflow-auto');
  });
});
