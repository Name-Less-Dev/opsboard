// Confere a pilha do Docker Compose no ar: o health da API (direto e pelo nginx) e o front.
const checks = [
  {
    name: 'API /health',
    url: 'http://localhost:3000/health',
    ok: (body) => JSON.parse(body).status === 'ok',
  },
  {
    name: 'nginx → API /api/health',
    url: 'http://localhost:8080/api/health',
    ok: (body) => JSON.parse(body).database === 'up',
  },
  {
    name: 'web /',
    url: 'http://localhost:8080/',
    ok: (body) => body.includes('<div id="root">'),
  },
];

let failed = false;
for (const check of checks) {
  try {
    const response = await fetch(check.url);
    const body = await response.text();
    const passed = response.ok && check.ok(body);
    console.log(`${passed ? 'ok ' : 'ERRO'} ${check.name}: ${response.status}`);
    failed ||= !passed;
  } catch (error) {
    console.log(`ERRO ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
  }
}
// exitCode (e não process.exit): sair à força com conexões do fetch abertas derruba o Node no Windows.
process.exitCode = failed ? 1 : 0;
