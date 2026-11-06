// Antes do e2e: garante que o Postgres está no ar. Se não responder e houver Docker, sobe o `db`
// do Compose; senão, para com uma mensagem clara. No CI, o service container já responde.
import { execSync } from 'node:child_process';
import net from 'node:net';

const url = new URL(
  process.env.E2E_DATABASE_URL ?? 'postgresql://opsboard:opsboard@localhost:5432/opsboard_e2e',
);
const host = url.hostname;
const port = Number(url.port || 5432);

function reachable() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(2000);
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

if (await reachable()) {
  console.log(`Postgres no ar em ${host}:${port}.`);
} else {
  console.log(`Postgres não respondeu em ${host}:${port}; subindo o serviço db do Docker Compose…`);
  try {
    execSync('docker compose up -d --wait db', { stdio: 'inherit' });
  } catch {
    console.error(
      'Não foi possível subir o Postgres. Rode "docker compose up -d db" (com o Docker aberto) ' +
        'ou defina E2E_DATABASE_URL apontando para um Postgres acessível.',
    );
    process.exit(1);
  }
}
