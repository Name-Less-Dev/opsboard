import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  caption,
  card,
  clickOn,
  hideCard,
  installOverlay,
  moveTo,
  pause,
  readingPause,
  look,
  typeInto,
} from './overlay.ts';

// Vídeo de demonstração (não é teste): roda só com `npm run video:demo`, fora do e2e e do CI.
// Aqui, e só aqui, as pausas fixas são permitidas: elas são tempo de leitura para quem assiste.
// Cada passo que depende da aplicação espera pelo elemento com `expect`, nunca por tempo.

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../../..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/video');
const SCENES_DIR = path.join(OUT_DIR, 'cenas');
const REPO_URL = 'https://github.com/Name-Less-Dev/opsboard';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} (as credenciais nunca ficam no código).`);
  return value;
}

const BASE_URL = (process.env.DEMO_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const SUPERVISOR = {
  email: required('DEMO_SUPERVISOR_EMAIL'),
  password: required('DEMO_SUPERVISOR_PASSWORD'),
};
const OPERATOR = {
  email: required('DEMO_OPERATOR_EMAIL'),
  password: required('DEMO_OPERATOR_PASSWORD'),
  name: process.env.DEMO_OPERATOR_NAME ?? 'Ana Operadora',
};

const localDate = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

let sceneNumber = 0;
async function endScene(page: Page, name: string, text: string) {
  await readingPause(page, text);
  sceneNumber += 1;
  await page.screenshot({
    path: path.join(SCENES_DIR, `${String(sceneNumber).padStart(2, '0')}-${name}.png`),
  });
}

async function say(page: Page, text: string) {
  await caption(page, text);
}

async function login(page: Page, user: { email: string; password: string }) {
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await typeInto(page, page.getByLabel('E-mail'), user.email);
  // Campo do tipo senha: a gravação mostra só os pontos.
  await typeInto(page, page.getByLabel('Senha'), user.password);
  await clickOn(page, page.getByRole('button', { name: 'Entrar' }));
  // Depois do login o app volta para a tela de onde a sessão saiu (ou o Painel, na primeira vez).
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible({ timeout: 90_000 });
}

async function logout(page: Page) {
  await clickOn(page, page.getByRole('button', { name: 'Sair' }));
  await expect(page).toHaveURL(/\/login$/);
}

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name, exact: true });

test('vídeo de demonstração do OpsBoard', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  rmSync(SCENES_DIR, { recursive: true, force: true });
  mkdirSync(SCENES_DIR, { recursive: true });

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: path.join(OUT_DIR, 'tmp'), size: { width: 1280, height: 720 } },
    colorScheme: 'light',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    // A cena final abre o GitHub, cuja CSP bloquearia o cursor e a legenda injetados.
    bypassCSP: true,
  });
  const page = await context.newPage();
  await installOverlay(page);
  const startedAt = Date.now();

  // 1. Título
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await card(
    page,
    'OpsBoard',
    'Painel de ordens de serviço full-stack, com React, NestJS e PostgreSQL',
  );
  await endScene(page, 'titulo', 'OpsBoard: painel de ordens de serviço full-stack');
  await pause(page, 2500);
  await hideCard(page);

  // 2. Login da supervisora
  await say(page, 'Entrando como supervisora. Todos os dados são fictícios.');
  await login(page, SUPERVISOR);
  await endScene(page, 'login', 'Entrando como supervisora.');

  // 3. Painel
  await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible();
  await look(page);
  const text3 = 'O painel conta as ordens por status e destaca as atrasadas.';
  await say(page, text3);
  for (const label of ['Atrasadas', 'Abertas', 'Em andamento', 'Concluídas']) {
    await moveTo(page, page.getByRole('link', { name: new RegExp(`^${label}: `) }));
    await pause(page, 600);
  }
  await endScene(page, 'painel', text3);

  // 4. Atrasadas → lista filtrada
  const text4 = 'Cada card abre a lista já filtrada. O filtro fica na URL.';
  await clickOn(page, page.getByRole('link', { name: /^Atrasadas: / }));
  await expect(page).toHaveURL(/overdue=true/);
  await expect(page.getByText(/^[\d.]+ (ordem encontrada|ordens encontradas)$/)).toHaveCount(1);
  await look(page);
  await say(page, text4);
  await moveTo(page, page.getByRole('checkbox', { name: 'Somente atrasadas' }));
  await endScene(page, 'atrasadas', text4);

  // 5. Detalhe com histórico
  const text5 = 'O histórico mostra quem fez o quê e quando.';
  await clickOn(
    page,
    page.getByRole('table', { name: 'Ordens de serviço' }).getByRole('link').first(),
  );
  const history = page.getByRole('list', { name: 'Histórico da ordem' });
  await expect(history).toBeVisible();
  await look(page);
  await moveTo(page, page.getByRole('heading', { name: 'Histórico' }));
  await say(page, text5);
  await moveTo(page, history.locator(':scope > li').first());
  await endScene(page, 'historico', text5);

  // 6. Criar e atribuir
  const text6 = `Criando uma ordem e atribuindo a ${OPERATOR.name}. Tudo entra no histórico.`;
  await say(page, 'Criando uma nova ordem de serviço.');
  await clickOn(page, nav(page, 'Ordens'));
  await clickOn(page, page.getByRole('link', { name: 'Nova ordem' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Nova ordem' })).toBeVisible();
  await look(page);
  const title = 'Trocar lâmpadas do galpão B';
  await typeInto(page, page.getByLabel('Título'), title);
  await typeInto(
    page,
    page.getByLabel('Descrição (opcional)'),
    'Três lâmpadas queimadas no corredor de carga.',
  );
  await moveTo(page, page.getByLabel('Prioridade'));
  await page.getByLabel('Prioridade').selectOption({ label: 'Alta' });
  await moveTo(page, page.getByLabel('Prazo', { exact: true }));
  await page.getByLabel('Prazo', { exact: true }).fill(localDate(7));
  await pause(page, 500);
  await clickOn(page, page.getByRole('button', { name: 'Criar ordem' }));
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const orderUrl = page.url();

  const assignee = page.getByLabel('Novo responsável');
  await expect(assignee).toBeEnabled();
  await moveTo(page, assignee);
  await assignee.selectOption({ label: `${OPERATOR.name} (Operador)` });
  await pause(page, 400);
  await clickOn(page, page.getByRole('button', { name: 'Atribuir responsável' }));
  await expect(
    page.getByRole('status').filter({ hasText: 'Responsável atualizado.' }),
  ).toBeVisible();
  await expect(history).toContainText('atribuiu a ordem');
  await say(page, text6);
  await moveTo(page, history.locator(':scope > li').first());
  await endScene(page, 'criar-atribuir', text6);

  // 7. Operadora: o que não vê e o que consegue
  await say(page, `Agora entrando como ${OPERATOR.name}, operadora.`);
  await logout(page);
  await login(page, OPERATOR);
  await page.goto(orderUrl);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const actions = page.getByRole('group', { name: 'Ações da ordem' });
  await expect(actions.getByRole('button', { name: 'Iniciar ordem' })).toBeVisible();
  await look(page);
  const text7a = 'Como operadora: sem Cancelar, Atribuir ou Excluir.';
  await say(page, text7a);
  await moveTo(page, actions);
  await readingPause(page, text7a);
  await clickOn(page, actions.getByRole('button', { name: 'Iniciar ordem' }));
  await expect(page.getByRole('status').filter({ hasText: 'Ordem iniciada.' })).toBeVisible();
  await pause(page, 900);
  await clickOn(page, actions.getByRole('button', { name: 'Concluir ordem' }));
  await expect(page.getByRole('status').filter({ hasText: 'Ordem concluída.' })).toBeVisible();
  const text7b = 'Ela inicia e conclui as próprias ordens.';
  await say(page, text7b);
  await moveTo(page, history.locator(':scope > li').first());
  await endScene(page, 'operadora', text7b);

  // 8. Exportar CSV com filtro
  await clickOn(page, nav(page, 'Ordens'));
  await clickOn(page, page.getByRole('checkbox', { name: 'Concluída' }));
  await expect(page).toHaveURL(/status=DONE/);
  await expect(page.getByText(/^[\d.]+ (ordem encontrada|ordens encontradas)$/)).toHaveCount(1);
  await look(page);
  await say(page, 'Exportando a lista filtrada em CSV.');
  const downloading = page.waitForEvent('download');
  await clickOn(page, page.getByRole('button', { name: 'Exportar CSV' }));
  const download = await downloading;
  await download.cancel().catch(() => undefined);
  const text8 = `CSV exportado: ${download.suggestedFilename()}`;
  await say(page, text8);
  await endScene(page, 'exportar', text8);

  // 9. Importar CSV: com erros, depois válido
  await say(page, 'De volta como supervisora, para importar ordens em lote.');
  await logout(page);
  await login(page, SUPERVISOR);
  await clickOn(page, nav(page, 'Ordens'));
  await clickOn(page, page.getByRole('link', { name: 'Importar CSV' }));
  await look(page);
  const fileInput = page.getByLabel('Arquivo CSV');
  await moveTo(page, fileInput);
  await fileInput.setInputFiles(path.join(REPO_ROOT, 'docs/examples/ordens-com-erros.csv'));
  await clickOn(page, page.getByRole('button', { name: 'Validar arquivo' }));
  const errorsTable = page.getByRole('table', { name: 'Erros por linha do arquivo' });
  await expect(errorsTable).toBeVisible();
  await look(page);
  const text9a = 'Importação tudo ou nada: com erro, nada é gravado.';
  await say(page, text9a);
  await moveTo(page, errorsTable);
  await endScene(page, 'importar-erros', text9a);

  const due = localDate(20);
  const valid = [
    'title;description;priority;dueDate;assigneeEmail',
    `Revisar extintores do galpão B;;Média;${due};${OPERATOR.email}`,
    `Limpar calhas do galpão B;Antes da chuva;Alta;${due};`,
    `Trocar filtro do ar da sala 3;;Baixa;${due};`,
  ].join('\r\n');
  await moveTo(page, fileInput);
  await fileInput.setInputFiles({
    name: 'ordens-novas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${String.fromCharCode(0xfeff)}${valid}\r\n`, 'utf8'),
  });
  await clickOn(page, page.getByRole('button', { name: 'Validar arquivo' }));
  await expect(page.getByRole('heading', { name: /^Arquivo válido/ })).toBeVisible();
  await say(page, 'Arquivo válido: agora sim, importar.');
  await pause(page, 1200);
  await clickOn(page, page.getByRole('button', { name: 'Importar 3 ordens' }));
  await expect(page.getByRole('status').filter({ hasText: '3 ordens importadas.' })).toBeVisible();
  const text9b = 'Três ordens importadas de uma vez.';
  await say(page, text9b);
  await endScene(page, 'importar-valido', text9b);

  // 10. Painel atualizado
  await clickOn(page, nav(page, 'Painel'));
  const open = page.getByRole('link', { name: /^Abertas: / });
  await expect(open).toBeVisible();
  await look(page);
  const text10 = 'O painel já mostra as novas ordens, sem recarregar.';
  await say(page, text10);
  await moveTo(page, open);
  await endScene(page, 'painel-atualizado', text10);

  // 11. GitHub (opcional): só se o CI da main estiver verde; senão, direto ao encerramento.
  try {
    const runs = await page.request.get(
      'https://api.github.com/repos/Name-Less-Dev/opsboard/actions/runs?branch=main&per_page=1',
      { timeout: 15_000 },
    );
    const latest = ((await runs.json()) as { workflow_runs?: { conclusion: string | null }[] })
      .workflow_runs?.[0];
    if (latest?.conclusion !== 'success') throw new Error(`CI: ${latest?.conclusion ?? '?'}`);

    await page.goto(`${REPO_URL}/actions`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'All workflows' })).toBeVisible({
      timeout: 15_000,
    });
    const text11a = 'Testes e CI no GitHub Actions a cada push.';
    await say(page, text11a);
    await endScene(page, 'github-actions', text11a);

    await page.goto(REPO_URL, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'OpsBoard' }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Desce até as capturas do README: a barra lateral (colaboradores, com nome e foto de perfil)
    // fica no topo da página e sai de vista.
    await page
      .getByRole('heading', { name: 'Capturas de tela' })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const text11b = 'Código, decisões e documentação no repositório.';
    await say(page, text11b);
    await endScene(page, 'github-readme', text11b);
  } catch (error) {
    console.log(`Cena do GitHub pulada: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Encerramento
  await caption(page, '').catch(() => undefined);
  await card(page, 'OpsBoard', REPO_URL.replace('https://', ''));
  await endScene(page, 'encerramento', 'OpsBoard no GitHub');
  await pause(page, 1000);

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const video = page.video();
  await context.close();
  if (!video) throw new Error('Vídeo não gravado');
  await video.saveAs(path.join(OUT_DIR, 'opsboard-demo.webm'));
  await video.delete();
  rmSync(path.join(OUT_DIR, 'tmp'), { recursive: true, force: true });
  console.log(`Vídeo salvo em docs/video/opsboard-demo.webm (cerca de ${seconds} s).`);
  expect(seconds, 'duração fora do alvo de 90 a 150 s').toBeGreaterThanOrEqual(90);
  expect(seconds, 'duração fora do alvo de 90 a 150 s').toBeLessThanOrEqual(150);
});
