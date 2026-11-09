// Smoke test contra uma API e um front publicados (ou locais). Só lê: não cria nem altera dados.
//
//   npm run smoke -- <URL_DA_API> <URL_DO_WEB> [--include-ratelimit]
//
// Login com o supervisor da demonstração (README). Para outro ambiente, defina SMOKE_EMAIL e
// SMOKE_PASSWORD. O `--include-ratelimit` erra a senha até receber 429: isso BLOQUEIA o login do
// seu próprio IP por 1 minuto (ou pelo tempo de LOGIN_RATE_TTL).

const args = process.argv.slice(2);
const includeRateLimit = args.includes('--include-ratelimit');
const [apiArg, webArg] = args.filter((arg) => !arg.startsWith('--'));
if (!apiArg || !webArg) {
  console.error('Uso: npm run smoke -- <URL_DA_API> <URL_DO_WEB> [--include-ratelimit]');
  process.exit(2);
}
const api = apiArg.replace(/\/+$/, '');
const web = webArg.replace(/\/+$/, '');
const webOrigin = new URL(web).origin;
const email = process.env.SMOKE_EMAIL ?? 'supervisora@example.com';
const password = process.env.SMOKE_PASSWORD ?? 'opsboard-demo';
const STRANGE_ORIGIN = 'https://origem-estranha.example.com';

let failures = 0;
let token = null;

async function check(name, run) {
  try {
    const detail = await run();
    console.log(`OK      ${name}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    failures += 1;
    console.log(`FALHOU  ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(url, init = {}, timeoutMs = 20_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

// A API do plano free pode estar dormindo: o primeiro acesso espera até 2 minutos.
await check('API /health (acorda a API se estiver dormindo)', async () => {
  const response = await get(`${api}/health`, {}, 120_000);
  const body = await response.json();
  assert(response.status === 200, `status ${response.status}`);
  assert(body.status === 'ok' && body.database === 'up', JSON.stringify(body));
  return 'banco up';
});

await check('web / devolve o HTML do app', async () => {
  const response = await get(`${web}/`);
  const html = await response.text();
  assert(response.status === 200, `status ${response.status}`);
  assert(html.includes('<div id="root">'), 'sem <div id="root">');
});

await check('web /orders (rota interna, F5) também devolve o HTML', async () => {
  const response = await get(`${web}/orders`);
  const html = await response.text();
  assert(response.status === 200, `status ${response.status}`);
  assert(html.includes('<div id="root">'), 'sem <div id="root">: a reescrita da SPA falhou');
});

await check(`login como ${email}`, async () => {
  const response = await get(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  assert(response.status === 200, `status ${response.status} (${body.code})`);
  assert(typeof body.accessToken === 'string', 'sem accessToken');
  token = body.accessToken;
  return `perfil ${body.user?.role}`;
});

await check('GET /work-orders com o token', async () => {
  assert(token, 'sem token (o login falhou)');
  const response = await get(`${api}/work-orders?pageSize=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert(response.status === 200, `status ${response.status}`);
  assert(Array.isArray(body.items), 'sem items');
  return `${body.total} ordens`;
});

await check('GET /dashboard/summary com o token', async () => {
  assert(token, 'sem token (o login falhou)');
  const response = await get(`${api}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert(response.status === 200, `status ${response.status}`);
  assert(body.byStatus && typeof body.overdue?.count === 'number', 'formato inesperado');
  return `${body.overdue.count} atrasadas`;
});

await check(`CORS libera a origem do front (${webOrigin})`, async () => {
  const response = await get(`${api}/health`, { headers: { Origin: webOrigin } });
  const allowed = response.headers.get('access-control-allow-origin');
  assert(allowed === webOrigin, `access-control-allow-origin = ${allowed}`);
  const exposed = (response.headers.get('access-control-expose-headers') ?? '').toLowerCase();
  assert(exposed.includes('content-disposition'), `expose-headers = ${exposed || '(nenhum)'}`);
});

await check('CORS bloqueia uma origem qualquer', async () => {
  const response = await get(`${api}/health`, { headers: { Origin: STRANGE_ORIGIN } });
  const allowed = response.headers.get('access-control-allow-origin');
  assert(allowed === null, `access-control-allow-origin = ${allowed}`);
});

await check('cabeçalhos de segurança do helmet', async () => {
  const response = await get(`${api}/health`);
  const missing = [
    'content-security-policy',
    'x-content-type-options',
    'strict-transport-security',
    'x-frame-options',
  ].filter((header) => !response.headers.get(header));
  assert(missing.length === 0, `faltando: ${missing.join(', ')}`);
  assert(!response.headers.get('x-powered-by'), 'x-powered-by exposto');
});

await check('Swagger em /docs', async () => {
  const response = await get(`${api}/docs`);
  const html = await response.text();
  assert(response.status === 200, `status ${response.status}`);
  assert(html.toLowerCase().includes('swagger'), 'página sem Swagger');
});

await check('erro no formato padrão (rota inexistente)', async () => {
  const response = await get(`${api}/rota-que-nao-existe`);
  const body = await response.json();
  const requestId = response.headers.get('x-request-id');
  assert(response.status === 404, `status ${response.status}`);
  assert(body.code === 'NOT_FOUND', `code ${body.code}`);
  assert(body.statusCode === 404 && body.path && body.timestamp, 'campos faltando');
  assert(requestId && body.requestId === requestId, 'requestId diferente do header');
  return `requestId ${requestId}`;
});

if (includeRateLimit) {
  await check('limite de login responde 429 (bloqueia o seu IP por 1 min)', async () => {
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const response = await get(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'senha-errada-do-smoke' }),
      });
      if (response.status === 429) {
        const body = await response.json();
        assert(body.code === 'TOO_MANY_REQUESTS', `code ${body.code}`);
        return `429 na tentativa ${attempt}`;
      }
    }
    throw new Error('15 tentativas sem 429');
  });
}

console.log(failures === 0 ? '\nSmoke: tudo OK.' : `\nSmoke: ${failures} item(ns) falharam.`);
// exitCode (e não process.exit): sair à força com conexões abertas derruba o Node no Windows.
process.exitCode = failures === 0 ? 0 : 1;
