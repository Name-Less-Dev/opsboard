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
| Camada | Tecnologia |
|---|---|
| Runtime | Node 24 LTS (`.nvmrc`), TypeScript 5.9 nos dois apps |
| Front | React 19 + TypeScript + Vite 8 (`apps/web`) |
| API | NestJS 11 + TypeScript (`apps/api`) — plano B: Fastify/Express |
| Banco | PostgreSQL 17 + Prisma |
| Auth | JWT, perfis `OPERATOR` e `SUPERVISOR` |
| Infra local | Docker Compose (`web`, `api`, `db`) |
| Testes | Jest (api), Vitest (web), Playwright (e2e) |
| CI | GitHub Actions |
| Docs da API | OpenAPI/Swagger |

## Estrutura
```
apps/api   # NestJS: auth, users, work-orders, events, prisma
apps/web   # React: pages, components, features, lib
```
Monorepo com npm workspaces (`apps/*`).

## Comandos (raiz)
| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências de todos os workspaces (um único lockfile na raiz) |
| `npm run dev` | Sobe API (:3000, watch) e web (:5173) juntos via `concurrently` |
| `npm run build` | Build de todos os apps |
| `npm run test` | Testes de todos os apps |
| `npm run lint` | Lint de todos os apps |

> Por app: `npm run <script> -w @opsboard/api` ou `-w @opsboard/web`.
> Pendentes (próximas tarefas): `docker compose up`, migrations e seed.

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
