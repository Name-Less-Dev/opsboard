# OpsBoard

Painel de ordens de serviço full-stack. Projeto de portfólio para vagas júnior full-stack
(painéis de operação, ferramentas internas). O dono do código precisa entender e defender
em entrevista tudo o que estiver aqui.

## Regras de trabalho

- Passos pequenos. Um commit por passo, em Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Antes de cada etapa, dizer em poucas linhas o que será feito. No fim, dizer como verificar que funcionou.
- Explicar decisões não óbvias em 1 ou 2 frases. Não gerar código que o dono não saiba defender.
- Fora do escopo: WebSocket, microsserviços, Redis, mensageria, tempo real.
- TypeScript estrito. Nada de `any` sem justificativa em comentário.
- Não inventar funcionalidades. Se algo estiver ambíguo, perguntar.
- Mostrar mudanças no modelo de dados antes de criar a migration.
- Manter este arquivo atualizado (stack, comandos, decisões).

## Convenções

- Código, enums, banco e rotas em inglês (`OPEN`, `IN_PROGRESS`, `/work-orders`).
- Textos da interface em pt-BR ("Aberta", "Em andamento").

## Stack

| Camada      | Tecnologia                                                          |
| ----------- | ------------------------------------------------------------------- |
| Runtime     | Node 24 LTS (`.nvmrc`), TypeScript 5.9 nos dois apps                |
| Front       | React 19 + TypeScript + Vite 8 (`apps/web`)                         |
| API         | NestJS 11 + TypeScript (`apps/api`) — plano B: Fastify/Express      |
| Banco       | PostgreSQL 17 + Prisma 7.10.1 (driver adapter `@prisma/adapter-pg`) |
| Auth        | JWT, perfis `OPERATOR` e `SUPERVISOR`                               |
| Infra local | Docker Compose (`web`, `api`, `db`)                                 |
| Testes      | Jest (api), Vitest (web), Playwright (e2e)                          |
| CI          | GitHub Actions                                                      |
| Docs da API | OpenAPI/Swagger                                                     |

## Estrutura

```
apps/api   # NestJS: health, prisma (PrismaService global); próximos: auth, users, work-orders, events
apps/web   # React: pages, lib (cliente HTTP); próximos: components, features
```

Monorepo com npm workspaces (`apps/*`).

## Comandos (raiz)

| Comando                     | O que faz                                                                  |
| --------------------------- | -------------------------------------------------------------------------- |
| `npm install`               | Instala as dependências de todos os workspaces (um único lockfile na raiz) |
| `npm run dev`               | Sobe API (:3000, watch) e web (:5173) juntos via `concurrently`            |
| `npm run build`             | Build de todos os apps                                                     |
| `npm run test`              | Testes de todos os apps                                                    |
| `npm run lint`              | Lint de todos os apps                                                      |
| `docker compose up --build` | Sobe db (:5432), api (:3000) e web (:8080, nginx com proxy `/api` → api)   |
| `docker compose down`       | Para os serviços (os dados ficam no volume `pgdata`; `-v` apaga)           |
| `npm run db:migrate`        | Cria/aplica migrations (`prisma migrate dev`) no banco do `.env`           |
| `npm run db:seed`           | Recria os dados de exemplo (idempotente: apaga e insere de novo)           |

> Por app: `npm run <script> -w @opsboard/api` ou `-w @opsboard/web`.
> Antes de migrations/seed: `cp .env.example .env` e `docker compose up -d db`.
> Usuários do seed: `supervisor@opsboard.dev`, `ana@opsboard.dev`, `bruno@opsboard.dev` — senha de dev `opsboard123`.

## Escopo do MVP

1. Login e dois perfis (operador e supervisor).
2. CRUD de ordens de serviço com validação (título, descrição, prioridade, responsável, prazo).
3. Fluxo de status ABERTA → EM_ANDAMENTO → CONCLUIDA (ou CANCELADA), com regra de quem muda cada transição.
4. Lista com filtros, busca e paginação, com estados de carregamento, erro e vazio.
5. Painel com contadores por status e itens atrasados.
6. Histórico de eventos de cada ordem, em tabela própria.
7. Importar e exportar CSV.

## Decisões

- **TypeScript 5.9 nos dois apps** (o template do Vite trazia o TS 7): Nest, ts-jest e typescript-eslint dependem da API JS do compilador, e uma versão única simplifica o lint compartilhado.
- **`strict: true` completo** em todos os tsconfigs (o Nest gera só flags isoladas).
- **Sem `npm install` dentro dos apps**: tudo é instalado pela raiz para manter um único `package-lock.json`.
- **Docker de produção, não de desenvolvimento**: os Dockerfiles são multi-stage (build → runtime enxuto). Para desenvolver com hot reload, use `npm run dev` no host e só o `db` do compose (`docker compose up db`).
- **Mesma origem para front e API**: o web chama sempre `/api/...`. No Docker, o nginx repassa para `api:3000`; no `npm run dev`, o proxy do Vite faz o mesmo. Por isso não há CORS.
- **Build context na raiz** nos Dockerfiles, para usar o `package-lock.json` único do workspace.
- **`.gitattributes` com `eol=lf`**: evita CRLF em arquivos que rodam dentro de containers Linux.
- **Prisma 7.10.1 fixado**: o `latest` do npm apontava para um release candidate da 8. Config em `apps/api/prisma.config.ts` (o Prisma 7 não lê `.env` sozinho; carregamos o `.env` da raiz com dotenv).
- **Client gerado em `apps/api/src/generated/prisma`** (fora do git). `prebuild` roda `prisma generate`, então `npm run build` e o Docker sempre geram antes de compilar.
- **Seed com `tsx`**: o client gerado importa arquivos com extensão `.js`, que o `ts-node` não resolve para `.ts`.
- **IDs UUID**, `assigneeId` opcional (ordem pode nascer sem responsável), eventos com `onDelete: Cascade`.
- **Migrations rodam do host** (`npm run db:migrate`) contra o Postgres exposto na 5432; a imagem da API não carrega o CLI do Prisma.
- **`GET /health` faz `SELECT 1`**: 200 `{status, database}` ou 503. O PrismaService não conecta no boot (conexão preguiçosa), então a API sobe com o banco fora e o health reporta o problema (~5 s, timeout do driver `pg`).
- **Jest com `moduleNameMapper` para `.js`**: o client gerado importa `./x.js`; o mapper remove a extensão para o ts-jest achar o `.ts`.
- **Teste e2e sem banco**: `overrideProvider(PrismaService)` troca o Prisma por um dublê.
- **ESLint e Prettier únicos na raiz** (`eslint.config.mjs`, `.prettierrc`): typescript-eslint com regras type-checked, `no-explicit-any` como erro (o template do Nest desligava), hooks/refresh do React só no web. Prettier roda separado; `eslint-config-prettier` só desliga regras de estilo conflitantes.
