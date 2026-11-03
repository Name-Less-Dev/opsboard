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
| Auth        | JWT via Passport, bcrypt, perfis `OPERATOR` e `SUPERVISOR`          |
| Infra local | Docker Compose (`web`, `api`, `db`)                                 |
| Testes      | Jest (api), Vitest (web), Playwright (e2e)                          |
| CI          | GitHub Actions                                                      |
| Docs da API | OpenAPI/Swagger em `/docs` (só na porta da API, `:3000`)            |

## Estrutura

```
apps/api   # NestJS: health, prisma (PrismaService global), users, auth, work-orders (eventos gravados aqui; leitura do histórico ainda não existe)
apps/web   # React: pages, components, features/auth, lib (cliente HTTP e sessão); próximas: features de ordens
```

Monorepo com npm workspaces (`apps/*`).

## Comandos (raiz)

| Comando                     | O que faz                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `npm install`               | Instala as dependências de todos os workspaces (um único lockfile na raiz)            |
| `npm run dev`               | Sobe API (:3000, watch) e web (:5173) juntos via `concurrently`                       |
| `npm run build`             | Build de todos os apps                                                                |
| `npm run test`              | Jest na API e Vitest no web. A API exige o Postgres no ar (`docker compose up -d db`) |
| `npm run lint`              | ESLint (config única na raiz) + `prettier --check` no monorepo                        |
| `npm run format`            | Formata tudo com Prettier                                                             |
| `docker compose up --build` | Sobe db (:5432), api (:3000) e web (:8080, nginx com proxy `/api` → api)              |
| `docker compose down`       | Para os serviços (os dados ficam no volume `pgdata`; `-v` apaga)                      |
| `npm run db:migrate`        | Cria/aplica migrations (`prisma migrate dev`) no banco do `.env`                      |
| `npm run db:seed`           | Recria os dados de exemplo (idempotente: apaga e insere de novo)                      |

> Por app: `npm run <script> -w @opsboard/api` ou `-w @opsboard/web`.
> No Docker as migrations rodam sozinhas e o seed é `docker compose run --rm migrate npx prisma db seed`. Pelo host: `cp .env.example .env`, `docker compose up -d db` e os scripts `db:*`.
> Usuários do seed: `supervisor@opsboard.dev`, `ana@opsboard.dev`, `bruno@opsboard.dev` — senha de dev `opsboard123`.

## Escopo do MVP

1. Login e dois perfis (operador e supervisor).
2. CRUD de ordens de serviço com validação (título, descrição, prioridade, responsável, prazo).
3. Fluxo de status ABERTA → EM_ANDAMENTO → CONCLUIDA (ou CANCELADA), com regra de quem muda cada transição.
4. Lista com filtros, busca e paginação, com estados de carregamento, erro e vazio.
5. Painel com contadores por status e itens atrasados.
6. Histórico de eventos de cada ordem, em tabela própria.
7. Importar e exportar CSV.

## Regras de negócio

Fonte da verdade do fluxo de ordens de serviço.

Estados: `OPEN`, `IN_PROGRESS`, `DONE`, `CANCELLED`. `DONE` e `CANCELLED` são finais.

Transições permitidas:

- `OPEN` → `IN_PROGRESS`: o responsável da ordem ou um `SUPERVISOR`.
- `IN_PROGRESS` → `DONE`: o responsável da ordem ou um `SUPERVISOR`.
- `OPEN` → `CANCELLED` e `IN_PROGRESS` → `CANCELLED`: somente `SUPERVISOR`.
- Qualquer outra combinação é inválida.

Permissões por ação:

- Listar e ver detalhe: qualquer usuário autenticado vê todas as ordens.
- Criar: qualquer autenticado. Se for `OPERATOR`, o responsável é forçado a ser ele mesmo (enviar outro responsável retorna 403). `SUPERVISOR` escolhe qualquer responsável, ou nenhum.
- Editar título e descrição: `SUPERVISOR` em qualquer ordem ativa; `OPERATOR` só nas ordens em que é o responsável, e só enquanto ativas.
- Editar prioridade e prazo: somente `SUPERVISOR`, em ordem ativa.
- Atribuir responsável: somente `SUPERVISOR`, em ordem ativa.
- Excluir: somente `SUPERVISOR`.
- Ordem em estado final não pode ser editada nem ter responsável alterado por ninguém (409).

Códigos HTTP: 404 ordem inexistente; 409 transição fora do grafo ou ordem em estado final; 403 ação válida no fluxo, mas sem permissão para este usuário; 400 validação de payload.

Casos de borda definidos:

- O fluxo vem antes da permissão: ordem final ou transição fora do grafo dá 409 mesmo para quem não teria permissão. A exceção são as rotas com `@Roles` (`DELETE` e atribuição), em que operador recebe 403 antes de a ordem ser consultada.
- Na criação, `priority` e `dueDate` são obrigatórios. Operador que envia `assigneeId` nulo ou o próprio id vira o responsável; qualquer outro valor dá 403, mesmo se o usuário não existir. Supervisor com responsável inexistente recebe 400.
- A criação grava só `CREATED`, com o responsável no payload.
- Na edição, a permissão olha os campos enviados, não se mudaram: operador enviando `priority` recebe 403 na requisição inteira, sem aplicação parcial. Corpo vazio dá 400. Valores iguais aos atuais dão 200, sem evento.
- `description: null` limpa a descrição; título, prioridade e prazo não aceitam `null`. O prazo pode estar no passado na edição, mas não na criação.
- Título e descrição passam por `trim` antes da validação. O prazo exige data e hora completas com fuso (ISO 8601). `:id` que não é UUID dá 400.
- Atribuir o responsável atual dá 200, sem evento. Supervisor pode tirar o responsável de ordem em andamento.
- Supervisor pode excluir ordem em qualquer estado; os eventos são apagados junto, sem registro da exclusão.

Listagem e painel:

- Atrasada = `dueDate` anterior ao instante atual E status em (`OPEN`, `IN_PROGRESS`). Sem prazo, ou em estado final, nunca é atrasada. Prazo exatamente igual ao instante atual ainda não é atrasado.
- Todos os usuários autenticados veem os mesmos dados na lista e no painel (sem escopo por perfil).
- Resultados com a mesma chave de ordenação saem em ordem estável (desempate por `id`, no mesmo sentido da ordenação), para a paginação não repetir nem pular itens.
- Filtros diferentes se combinam com AND; valores de um mesmo filtro separados por vírgula se combinam com OR.
- Datas são comparadas como instantes (o banco guarda em UTC). `dueFrom` e `dueTo` exigem data, hora e fuso, como o prazo da criação, e o intervalo é inclusivo.
- Em `status` e `priority`, espaços e valores repetidos são ignorados, assim como itens vazios (`OPEN,`). `q` passa por trim, é ignorado se vazio e dá 400 acima de 100 caracteres.
- A prioridade ordena por gravidade (`LOW` < `MEDIUM` < `HIGH` < `URGENT`), que é a ordem de declaração do enum no Postgres.

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
- **Migrations automáticas no compose**: serviço `migrate` (estágio `migrate` do Dockerfile da API, a partir do `build`) roda `prisma migrate deploy` e termina; a `api` depende dele com `service_completed_successfully`. A imagem de runtime continua sem o CLI do Prisma. O seed é manual (apaga dados): `docker compose run --rm migrate npx prisma db seed`. No host, `npm run db:migrate` (`migrate dev`) segue sendo o jeito de criar migrations novas.
- **`GET /health` faz `SELECT 1`**: 200 `{status, database}` ou 503. O PrismaService não conecta no boot (conexão preguiçosa), então a API sobe com o banco fora e o health reporta o problema (~5 s, timeout do driver `pg`).
- **Jest com `moduleNameMapper` para `.js`**: o client gerado importa `./x.js`; o mapper remove a extensão para o ts-jest achar o `.ts`.
- **Teste e2e sem banco**: `overrideProvider(PrismaService)` troca o Prisma por um dublê.
- **ESLint e Prettier únicos na raiz** (`eslint.config.mjs`, `.prettierrc`): typescript-eslint com regras type-checked, `no-explicit-any` como erro (o template do Nest desligava), hooks/refresh do React só no web. Prettier roda separado; `eslint-config-prettier` só desliga regras de estilo conflitantes.
- **Pacotes do Nest na major 11**: `@nestjs/swagger` mais recente exige o Nest 12, e atualizar o framework não fez parte do Dia 2.
- **Protegido por padrão**: `JwtAuthGuard` e `RolesGuard` são globais (`APP_GUARD`, nessa ordem: 401 antes de 403); rota aberta precisa de `@Public()`. `ValidationPipe` também é provider (`APP_PIPE`), para valer nos testes de integração.
- **Token só com `sub`**: o `JwtStrategy` busca o usuário a cada requisição. Perfil alterado vale na hora e usuário removido perde o acesso, ao custo de uma consulta por requisição.
- **Login sem revelar e-mails**: mesma mensagem para senha errada e e-mail inexistente, e o e-mail inexistente também roda `bcrypt.compare` (contra um hash fictício) para igualar o tempo de resposta.
- **`passwordHash` nunca sai**: `findById` usa `select` com lista de permissão; `findByEmail` traz o hash só para o login, que monta a resposta campo a campo.
- **`JWT_SECRET` sem valor padrão no compose** (`:?`): melhor falhar do que subir com um segredo conhecido.
- **Token em memória + localStorage**: sobrevive ao recarregar e não sofre CSRF, mas um XSS consegue lê-lo; a expiração de 1h limita o estrago.
- **401 no cliente HTTP só derruba a sessão se a requisição levava token**: senão, senha errada no login causaria redirecionamento em vez de mensagem. A saída para `/login` passa pelo estado do `AuthProvider` e pelo `ProtectedRoute`, que guarda a página de origem.
- **Testes de integração da API sem banco**: `AppModule` real com um dublê do Prisma que respeita `select` (`test/test-app.ts`). Sem rota real com `@Roles` ainda, o 403 é testado com um controller que só existe no teste.
- **Conhecido e fora do escopo do Dia 2**: sem limite de tentativas de login; e-mail é comparado exatamente como digitado (maiúsculas não são normalizadas).
- **Rota inexistente sem token responde 404**: os guards do Nest só rodam em rotas que existem, e nenhum dado fica exposto. Decisão aceita pelo dono no Dia 2.
- **`/docs` é público**: o botão "Authorize" do Swagger depende disso; as rotas documentadas continuam protegidas.
- **Política em funções puras** (`work-orders/work-order.policy.ts`): o service só traduz a decisão em HTTP. O esperado da matriz de 64 casos é uma tabela escrita à mão, para o teste não repetir a lógica testada.
- **`@Roles` só em `DELETE` e atribuição**: o endpoint de status é compartilhado, então quem decide é a política.
- **Controle de corrida com `updateMany`**: status, edição e atribuição exigem na condição o status lido antes. Se outra requisição mudou nesse intervalo, nenhuma linha é afetada, o erro desfaz a transação e a resposta é 409.
- **Mudança e evento na mesma `$transaction`**: testado com um trigger temporário que faz o `INSERT` do evento falhar de verdade no banco.
- **`PrismaService` direto no service**: um repository seria uma camada a mais sem ganho por enquanto.
- **`transform: true` no `ValidationPipe`**: necessário para o `trim` valer e para converter `page`/`pageSize`. Campos que não aceitam `null` usam `@ValidateIf`, porque `@IsOptional` também pula `null`.
- **`pageSize` padrão 20**, máximo 100. A lista desempata por `id` para a paginação não repetir nem pular ordens.
- **Banco de teste separado** (`opsboard_test`, via `TEST_DATABASE_URL`): `test/global-setup.ts` cria o banco e aplica as migrations; `getTestDatabaseUrl()` recusa nomes que não terminem em `_test`, e a suíte confere `current_database()` antes do `TRUNCATE`. Roda com `maxWorkers: 1`, porque as suítes compartilham o banco.
- **`--experimental-vm-modules` no `test:e2e`**: o client do Prisma 7 carrega o motor WASM com `import()` dinâmico, que a VM do Jest bloqueia sem a flag.
- **`npm ci` repetido uma vez nos Dockerfiles**: o build falhou duas vezes com erro de rede (`ECONNRESET`, confirmado no log da segunda) e passou ao repetir. Repetir o comando cobre download interrompido no meio, e o que já foi baixado vem do cache.
