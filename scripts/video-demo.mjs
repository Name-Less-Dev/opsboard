// Grava o vídeo de demonstração com o Playwright.
//
//   npm run video:demo -- [--base <URL do front>] [--api <URL da API>] [--reset-demo]
//
// --base (ou DEMO_BASE_URL): onde gravar; padrão, a pilha local do Docker Compose (:8080).
// --api: acorda a API (/health) antes de gravar, útil no plano free que hiberna.
// --reset-demo: roda `seed:demo` antes e depois (pede ALLOW_DEMO_RESET e a confirmação do host).
// Credenciais: DEMO_SUPERVISOR_EMAIL/PASSWORD e DEMO_OPERATOR_EMAIL/PASSWORD no ambiente.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const base = option('--base') ?? process.env.DEMO_BASE_URL ?? 'http://localhost:8080';
const api = option('--api');
const reset = args.includes('--reset-demo');

const run = (command, cwd = '.') =>
  spawnSync(command, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DEMO_BASE_URL: base },
  }).status ?? 1;

if (api) {
  console.log(`Acordando a API em ${api}/health (até 2 minutos)…`);
  const response = await fetch(`${api.replace(/\/+$/, '')}/health`, {
    signal: AbortSignal.timeout(120_000),
  });
  console.log(`API: ${response.status} ${await response.text()}`);
}

if (reset && run('npm run seed:demo') !== 0) {
  console.error('seed:demo não rodou: nada foi gravado.');
  process.exitCode = 1;
} else {
  console.log(`Gravando contra ${base}…`);
  const status = run('npx playwright test -c playwright.video.config.ts', 'apps/web');
  // Mesmo se a gravação falhar, os dados criados por ela saem da demonstração.
  if (reset) {
    console.log('Limpando os dados criados pelo vídeo (seed:demo de novo)…');
    run('npm run seed:demo');
  }

  const webm = 'docs/video/opsboard-demo.webm';
  if (status === 0 && existsSync(webm)) {
    const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (ffmpeg.status === 0) {
      run(
        `ffmpeg -y -loglevel error -i ${webm} -c:v libx264 -pix_fmt yuv420p docs/video/opsboard-demo.mp4`,
      );
      console.log('MP4 gerado em docs/video/opsboard-demo.mp4.');
    } else {
      console.log('ffmpeg não encontrado: só o .webm foi gerado (não instalei nada).');
    }
  }
  process.exitCode = status;
}
