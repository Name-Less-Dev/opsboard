# OpsBoard

Painel de ordens de serviço full-stack: operadores e supervisores acompanham ordens de serviço
(abertura, andamento, conclusão), com histórico de eventos de cada ordem.

> **Status:** em construção. Hoje existem a infraestrutura (Docker, banco, migrations, seed),
> o endpoint `GET /health` e a tela inicial que mostra o estado da API. Login, CRUD, painel e
> CSV ainda não foram implementados.

## Stack

- **Front:** React 19 + TypeScript + Vite (`apps/web`)
- **API:** NestJS 11 + TypeScript (`apps/api`)
- **Banco:** PostgreSQL 17 + Prisma 7
- **Infra local:** Docker Compose (`db`, `api`, `web`)
- **Qualidade:** TypeScript estrito, ESLint + Prettier compartilhados, Jest na API

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (com Docker Compose)
- [Node.js 24](https://nodejs.org/) e npm — necessários para rodar migrations e seed

## Rodando com Docker

```bash
cp .env.example .env
docker compose up --build
```

| Serviço  | URL                          |
| -------- | ---------------------------- |
| Web      | http://localhost:8080        |
| API      | http://localhost:3000/health |
| Postgres | `localhost:5432`             |

A tela do web deve mostrar **"API ok"**. O web chama a API pelo caminho `/api`, que o nginx
repassa para o serviço `api`.

### Banco: migrations e seed

Com o `db` rodando, em outro terminal na raiz do projeto:

```bash
npm install
npm run db:migrate
npm run db:seed
```

O seed apaga e recria os dados de exemplo (pode ser rodado várias vezes): 1 supervisor,
2 operadores e 10 ordens de serviço com status e prazos variados.

| Usuário                   | Perfil     | Senha (dev)   |
| ------------------------- | ---------- | ------------- |
| `supervisor@opsboard.dev` | SUPERVISOR | `opsboard123` |
| `ana@opsboard.dev`        | OPERATOR   | `opsboard123` |
| `bruno@opsboard.dev`      | OPERATOR   | `opsboard123` |

Os dados ficam no volume `pgdata` e sobrevivem a `docker compose down`.
Para apagar tudo: `docker compose down -v`.

## Desenvolvimento (hot reload)

Rode só o banco no Docker e os apps no host:

```bash
docker compose up -d db
npm run dev
```

Web em http://localhost:5173 (o Vite repassa `/api` para a API em `:3000`).

## Scripts (raiz)

| Comando              | O que faz                                     |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | API (watch) e web (Vite) juntos               |
| `npm run build`      | Build de todos os apps                        |
| `npm run test`       | Testes de todos os apps                       |
| `npm run lint`       | ESLint + verificação de formatação (Prettier) |
| `npm run format`     | Formata o código com Prettier                 |
| `npm run db:migrate` | Cria/aplica migrations do Prisma              |
| `npm run db:seed`    | Popula o banco com dados de exemplo           |

## Estrutura

```
apps/
  api/   # NestJS + Prisma (schema, migrations e seed em apps/api/prisma)
  web/   # React + Vite
docker-compose.yml
```
