// Gera o `.env.ci` do job `docker`: o `.env.example` com um JWT_SECRET aleatório criado na hora
// (32 bytes em hex, como `openssl rand -hex 32`). Arquivo separado do `.env` de desenvolvimento,
// que nunca é tocado; o `.env.ci` fica fora do git (regra `.env.*`).
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const example = readFileSync('.env.example', 'utf8');
const secret = randomBytes(32).toString('hex');
if (!/^JWT_SECRET=.*$/m.test(example)) {
  console.error('JWT_SECRET não encontrado no .env.example');
  process.exit(1);
}
writeFileSync('.env.ci', example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
console.log('.env.ci gerado a partir do .env.example, com JWT_SECRET descartável.');
