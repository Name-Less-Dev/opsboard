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
apps/api   # NestJS: health, prisma (PrismaService global), users, auth, work-orders (eventos gravados aqui), events (leitura do histórico), dashboard, clock
apps/web   # React: pages, components, features (auth, work-orders, dashboard), lib (cliente HTTP, erros, query, tema), test (MSW)
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
| `npm run seed:large`        | Acrescenta 5.000 ordens `[volume]` (opcional; substitui só as próprias)               |

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

Histórico de eventos:

- O histórico é append-only: nenhum endpoint edita ou apaga eventos. A única remoção é em cascata, quando a ordem é excluída.
- Qualquer usuário autenticado lê o histórico de qualquer ordem (`GET /work-orders/:id/events`). Ordem inexistente dá 404 `NOT_FOUND`.
- Ordem: mais recentes primeiro (`createdAt desc`), com desempate por `id` no mesmo sentido.
- A resposta nunca traz e-mail, hash nem o `payload` bruto: o `actor` tem só `id` e `name`, e os `details` são montados por tipo (`events/event-details.mapper.ts`). Na edição da descrição, sai só o nome do campo, sem o texto. Evento com payload em formato inesperado sai com `details: null`, sem derrubar a leitura.

Importação e exportação CSV:

- Exportar (`GET /work-orders/export`): qualquer usuário autenticado, com os mesmos filtros e a mesma ordenação de `GET /work-orders`, sem `page` e `pageSize` (enviar um deles dá 400). No máximo `EXPORT_MAX_ROWS` linhas (padrão 10000); acima disso, 422 `EXPORT_TOO_LARGE`, pedindo mais filtros.
- Importar (`POST /work-orders/import`): somente `SUPERVISOR`. Toda ordem importada nasce `OPEN`, criada pelo supervisor que importou, com as mesmas validações da criação normal (título 3 a 120, descrição até 2000, prioridade obrigatória, prazo não pode estar no passado).
- Importação é tudo ou nada: uma linha inválida impede a gravação de todas.
- Importar sempre cria ordens novas: não atualiza existentes nem detecta duplicadas (o mesmo arquivo duas vezes cria duas vezes).
- Cada ordem importada gera os mesmos eventos de uma criação normal; o `payload` do `CREATED` leva também `source: 'csv_import'`. O histórico continua mostrando `details: null` para `CREATED`.

Formato da exportação:

- UTF-8 com BOM, separador `;`, quebra de linha CRLF, aspas duplas quando necessário (RFC 4180).
- Colunas: `id;title;description;priority;status;dueDate;assigneeName;createdByName;createdAt;updatedAt`. `priority` e `status` com os rótulos em português; datas em ISO 8601 UTC; sem responsável, célula vazia. Nunca e-mail nem hash.
- Cabeçalhos: `Content-Type: text/csv; charset=utf-8` e `Content-Disposition: attachment; filename="opsboard-ordens-AAAAMMDD-HHmm.csv"` (horário no `APP_TIMEZONE`).
- Injeção de fórmula: célula de texto livre (título, descrição, nomes) que, depois dos espaços iniciais, comece com `=`, `+`, `-`, `@`, tab ou CR ganha um `'` na frente. O valor no banco não muda.

Formato da importação (`multipart/form-data`, campo `file`, query `dryRun=true|false`, padrão `false`):

- Cabeçalho obrigatório, com os nomes `title`, `description`, `priority`, `dueDate`, `assigneeEmail` (sem diferenciar maiúsculas). `title` e `priority` precisam existir; as demais podem faltar ou vir vazias. Coluna desconhecida ou repetida é erro do arquivo.
- Separador detectado pelo cabeçalho (`;` ou `,`); BOM ignorado; CRLF e LF aceitos. Arquivo que não é UTF-8 válido é erro do arquivo, com a dica "salve como CSV UTF-8".
- `priority`: enum (`LOW`...) ou rótulo em português, sem diferenciar maiúsculas e com `trim`. Vazio é erro.
- `dueDate`: ISO 8601 completo (com `Z` ou offset) ou só `AAAA-MM-DD`, que vale o fim desse dia no `APP_TIMEZONE` (padrão `America/Sao_Paulo`). Prazo no passado é erro.
- `assigneeEmail`: vazio = sem responsável; e-mail inexistente é erro da linha; comparação sem diferenciar maiúsculas.
- Linhas totalmente vazias são ignoradas. O número da linha no relatório é o do registro no arquivo, com o cabeçalho na linha 1.
- Limites: arquivo até 1 MB (acima, 413 `PAYLOAD_TOO_LARGE`) e até `IMPORT_MAX_ROWS` registros (padrão 500).
- Erros do arquivo (ausente, vazio, sem cabeçalho obrigatório, coluna desconhecida ou repetida, não UTF-8, linhas demais, CSV malformado): 400 `IMPORT_FILE_INVALID`, com mensagem específica. Nunca 500.
- `dryRun=true`: sempre 200 com `{ dryRun: true, valid, totalRows, validRows, totalErrors, errors }`; `errors` tem no máximo 100 itens `{ row, column, code, message }` (`column` pode ser nulo). Códigos de linha: `REQUIRED`, `TOO_SHORT`, `TOO_LONG`, `INVALID_ENUM`, `INVALID_DATE`, `DATE_IN_PAST`, `UNKNOWN_ASSIGNEE`. Nada é gravado.
- `dryRun=false`: tudo válido dá 201 `{ dryRun: false, imported }`; qualquer erro de linha dá 422 `IMPORT_INVALID`, com a mesma lista em `details` (e `totalErrors`), e nada é gravado.

## Convenções do front (`apps/web`)

- **URL como fonte da verdade** da lista: filtros, busca, ordenação e página vivem na query string. A tela lê com `parseListParams` e escreve com `serializeListParams` (`features/work-orders/list-params.ts`); valor inválido na URL é descartado, nunca quebra a tela. F5, colar a URL e voltar/avançar reproduzem a mesma tela.
- Parâmetros da URL: `q`, `status` e `priority` (lista por vírgula), `assignee=me` ("Minhas ordens"), `overdue=true`, `dueFrom`/`dueTo` (data local `AAAA-MM-DD`), `sortBy`, `order`, `page`, `pageSize`. Valores padrão são omitidos. Só `toApiQuery` traduz para a query da API.
- Mudar filtro, busca ou ordenação volta para a página 1; mudar só a página não mexe no resto. "Limpar filtros" mantém a ordenação.
- **Erros pelo `code`**, nunca pelo texto da API: o cliente (`lib/api.ts`) lança `ApiError` com `statusCode`, `code`, `message`, `details` e `requestId`. As mensagens para o usuário ficam só em `lib/error-messages.ts`, indexadas por `code`, com texto padrão para código desconhecido. Sem resposta do servidor, o `code` é `NETWORK_ERROR`. O `requestId` só aparece em erro inesperado (500).
- **Datas**: a API trabalha em UTC; a tela exibe no fuso do navegador com `Intl.DateTimeFormat('pt-BR')`. Os filtros de prazo são datas locais: "de" vira o início do dia local e "até" o fim do dia local, em ISO com fuso.
- **Sem biblioteca de componentes** (MUI, Chakra, shadcn etc.): Tailwind CSS com cores e espaçamentos em variáveis CSS (tema claro e escuro). Componentes próprios em `components/`.
- **Dados do servidor com TanStack Query**; sem Redux, Zustand ou outro estado global.
- Status e prioridade nunca dependem só de cor: sempre com texto.
- **Formulários** com `react-hook-form` + `zod`. O schema espelha as regras da API (título 3 a 120, descrição até 2000, prioridade no enum), mas a API é a fonte da verdade: o `details` de um 400 é mapeado para o campo pelo `field`. Validação ao sair do campo e no envio, com foco no primeiro campo com erro e resumo de erros.
- **Prazo no formulário**: `input type="date"`; ao enviar vira o **fim do dia local** em ISO (UTC). Na criação não aceita data anterior a hoje; na edição aceita (a API só proíbe na criação).
- **Ações por `getAvailableActions(user, order)`** (`features/work-orders/permissions.ts`): espelho da política do back (`work-order.policy.ts`), que continua sendo a fonte da verdade. Os testes copiam a matriz do back.
- **Mutações sem atualização otimista**: a tela espera a resposta, desabilita o botão durante o envio e, no sucesso, invalida a lista e o detalhe. Em 409 mostra a mensagem do `code` e busca o detalhe de novo.
- **Confirmação de ações destrutivas** (cancelar e excluir) com o `<dialog>` nativo, com o foco devolvido ao botão de origem. Feedback de sucesso numa região `role="status"`, sem biblioteca de toast.
- **Rota inicial**: `/` redireciona para `/dashboard`. A navegação tem "Painel" e "Ordens", com o item ativo marcado por `aria-current="page"`.
- **Links do painel para a lista** são montados com `serializeListParams` a partir de `ListParams` (nunca string concatenada); um teste passa cada link por `parseListParams` e confere o filtro.
- **Relógio do painel**: "há N dias" e "Atualizado às HH:mm" usam o `generatedAt` da resposta como "agora", não o relógio do navegador.
- **Chaves de cache centralizadas**: a do painel fica em `features/dashboard/dashboard-keys.ts`; as mutações de ordem (criar, editar, status, atribuir, excluir) invalidam lista, detalhe e painel.
- **Histórico da ordem** (`features/work-orders/history/`): o texto de cada evento vem só de `describeEvent(event)`, uma função pura que lê os `details` pelo tipo gerado (`api-types.ts`); tipo ou formato desconhecido vira texto genérico. A página da linha do tempo fica em estado local da seção (não na URL), com `pageSize` 10.
- **Chaves do histórico** em `workOrderKeys.history(id, page)`: editar, mudar status e atribuir invalidam o histórico daquela ordem; excluir remove do cache o detalhe e o histórico.
- **Cliente HTTP com arquivos** (`lib/api.ts`): `send` cuida do token, do 401 e do erro; `request` lê JSON, `apiDownload` lê Blob e devolve o `Content-Disposition`, `apiUpload` envia `FormData` sem `Content-Type` manual (o navegador põe o `boundary`). Em erro, o corpo é lido como JSON pelo `code` em todos. `details` por linha (`IMPORT_INVALID`) vai para `rowErrors`/`totalErrors`, nunca para `details`, que segue só por campo.
- **Download pelo navegador** (`lib/download.ts`): link temporário com `download`, clique programático e `URL.revokeObjectURL` num `setTimeout(0)`, para o download já ter começado quando a URL é liberada. A exportação usa isso porque um `<a href>` direto não enviaria o token.
- **CSV no front** (`features/work-orders/csv/`): `buildExportQuery` é o `toApiQuery` sem `page`/`pageSize`; o modelo em branco é gerado no navegador; o relatório usa mensagens próprias por `code` e coluna (o texto da API só para um código desconhecido). Importar invalida lista e painel; validar não invalida nada.
- **Upload nos testes** (`test/import-api-mock.ts`): o `FormData` do jsdom não atravessa o `fetch` do Node usado pelo MSW (sai com Content-Length errado), então a rota de importação é atendida por um `fetch` falso que lê o `FormData` direto; o resto segue no MSW.
- **Painel sem atualização automática**: sem polling, WebSocket ou `refetchOnWindowFocus`; `staleTime` de 30 s e botão "Atualizar".

| Enum                      | Rótulo                |
| ------------------------- | --------------------- |
| `OPEN`                    | Aberta                |
| `IN_PROGRESS`             | Em andamento          |
| `DONE`                    | Concluída             |
| `CANCELLED`               | Cancelada             |
| `LOW`                     | Baixa                 |
| `MEDIUM`                  | Média                 |
| `HIGH`                    | Alta                  |
| `URGENT`                  | Urgente               |
| `OPERATOR` / `SUPERVISOR` | Operador / Supervisor |

## Formato de erro

Toda resposta de erro, de qualquer rota, tem este formato:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": [
    { "field": "title", "messages": ["title must be longer than or equal to 3 characters"] }
  ],
  "path": "/work-orders",
  "timestamp": "2026-11-04T12:00:00.000Z",
  "requestId": "0b6d2a4e-3f1c-4d9a-8e7b-5c2f1a0d9e8b"
}
```

- `code` é estável (UPPER_SNAKE_CASE) e é o que o front usa; `message` é legível, em português, e pode mudar.
- `details` só existe em `VALIDATION_ERROR` e `IMPORT_INVALID` (sempre presente nos dois, mesmo vazio). O formato depende do `code`: em `VALIDATION_ERROR`, uma entrada `{ field, messages }` por campo, inclusive de query params e do `:id` da rota; em `IMPORT_INVALID`, até 100 entradas `{ row, column, code, message }`, com o total real em `totalErrors`.
- `requestId` também volta no header `x-request-id`. Se o cliente enviar um `x-request-id` válido (até 128 caracteres de letras, números, `.`, `_` e `-`), ele é reaproveitado.
- Em 500, a resposta nunca traz stack trace, nome de tabela ou mensagem do Prisma: o detalhe vai para o log com o mesmo `requestId`.
- O login continua com a mesma mensagem para senha errada e e-mail inexistente.

| `code`                | Status | Quando                                                            |
| --------------------- | ------ | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`    | 400    | Payload, query ou parâmetro de rota inválido; JSON malformado     |
| `UNAUTHORIZED`        | 401    | Token ausente, inválido ou expirado; credenciais inválidas        |
| `FORBIDDEN`           | 403    | Ação válida no fluxo, mas sem permissão para este usuário         |
| `NOT_FOUND`           | 404    | Ordem, registro ou rota inexistente                               |
| `INVALID_TRANSITION`  | 409    | Transição de status fora do grafo                                 |
| `ORDER_FINALIZED`     | 409    | Ordem em estado final não pode ser alterada                       |
| `CONCURRENT_UPDATE`   | 409    | Outra requisição alterou a ordem entre a leitura e a gravação     |
| `CONFLICT`            | 409    | Violação de unicidade ou de chave estrangeira no banco            |
| `TOO_MANY_REQUESTS`   | 429    | Limite de tentativas de login excedido                            |
| `EXPORT_TOO_LARGE`    | 422    | Exportação acima de `EXPORT_MAX_ROWS` linhas                      |
| `IMPORT_FILE_INVALID` | 400    | Arquivo de importação inválido (vazio, cabeçalho, UTF-8, limites) |
| `IMPORT_INVALID`      | 422    | Importação com erro em alguma linha; nada foi gravado             |
| `PAYLOAD_TOO_LARGE`   | 413    | Corpo ou arquivo acima do limite (1 MB na importação)             |
| `HTTP_ERROR`          | 4xx    | Outro erro HTTP do framework (ex.: 405), com o status original    |
| `INTERNAL_ERROR`      | 500    | Erro inesperado; detalhe só no log                                |
| `SERVICE_UNAVAILABLE` | 503    | `GET /health` com o banco fora do ar                              |

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
- **Sem índice composto `(status, dueDate)`** (medido com `EXPLAIN ANALYZE` em 5.010 ordens, seed de volume): as 10 atrasadas mais antigas já usam o índice de `dueDate` e param no 10º item (0,23 ms, igual com ou sem o composto). A contagem de atrasadas cai de 1,06 ms (Bitmap Heap Scan, 124 buffers) para 0,33 ms (Index Only Scan, 12 buffers), mas 0,7 ms não paga o custo de mais um índice em toda escrita de status e prazo. Rever quando a contagem pesar de verdade.
- **Histórico sem índice novo** (Dia 9): o `(workOrderId, createdAt)` da migration inicial já atende `GET /work-orders/:id/events`. Medido com `EXPLAIN ANALYZE` no seed grande (10.517 eventos, ordem com 28): a página usa Index Scan Backward (0,19 ms, 12 buffers) contra Seq Scan sem o índice (1,28 ms, 276 buffers), e a contagem cai de 0,59 ms para 0,04 ms. O desempate por `id` só acrescenta um Incremental Sort sobre linhas que já chegam na ordem de `createdAt`, então incluir o `id` no índice não paga mais uma escrita por evento.
- **Leitura do histórico** (`src/events`): ordem, página e contagem numa transação `RepeatableRead`, como a lista; os nomes citados em `ASSIGNED` vêm de uma consulta só (`assignedUserIds`). O `payload` é convertido em `details` por `event-details.mapper.ts`, que confere o formato real gravado pelo Dia 3 (UPDATED: um objeto `{from, to}` por campo; ASSIGNED: ids) e devolve `null` em vez de lançar. O Swagger descreve `items` e `changes` como uniões discriminadas (`oneOf` + `discriminator`), para o `api-types.ts` sair tipado por `type`.
- **Filtro e ordenação em funções puras** (`work-orders/work-order-query.ts`): o service só executa. Cada filtro vira um item de `AND: [...]`, para `overdue` e o intervalo de prazo (mesmo campo) não se sobrescreverem. A regra de atrasada (`overdueWhere`) é a mesma na lista e no painel.
- **`Clock` injetável** (`src/clock`): o "agora" vem de um provider; os testes trocam por um instante fixo com `overrideProvider(Clock)`. Exceção: o `@IsNotInPast` da criação (Dia 3) ainda usa `Date.now()`, porque roda no ValidationPipe, fora da injeção.
- **`RepeatableRead` na lista e no painel**: as consultas da mesma resposta leem a mesma foto do banco. No padrão (`ReadCommitted`), uma ordem criada entre o `count` e o `findMany` faria o `total` divergir da lista.
- **Painel com transação interativa**: na forma em array do `$transaction`, o Prisma perde o tipo do `groupBy`.
- **Busca escapa a barra invertida, `%` e `_`**: medido no banco, o `contains` do Prisma não escapa nada; sem isso, `_` achava tudo e uma busca por um caminho como `C:` seguido de barra e `temp` não achava nada.
- **Prazo obrigatório mantido** (Dia 4): as regras sobre "sem prazo" e `nulls: 'last'` não têm efeito, porque `dueDate` é `NOT NULL`; o Prisma nem aceita `nulls` nesse campo.
- **Um único filtro de erros** (`AllExceptionsFilter`, `APP_FILTER`): tudo que é lançado passa pelo `mapError`. O nosso código lança `DomainException` com `code` explícito; erros do framework (guards, pipes, rota inexistente) ganham o texto da tabela. Pipe e filtro são providers para valer nos testes.
- **`requestId` resolvido em dois lugares, com a mesma função idempotente** (`ensureRequestId`): no middleware e no filtro. O body-parser roda antes do middleware, então o 400 de JSON malformado só ganha id pelo filtro.
- **Log de erro só em 5xx**, com método, caminho, status, `requestId` e a stack (ou a `cause`, como a falha do banco no `/health`). Nunca corpo, headers ou token.
- **Log de requisição** (`common/request-log`): uma linha no `finish` com método, caminho sem query, status, duração, `requestId` e `userId` (`-` se anônimo). Lista fechada de campos, então corpo, headers, token e e-mail não entram. 2xx/3xx como `log`, 4xx/5xx como `warn`. Como o `requestId`, o filtro chama `trackRequest` de novo para cobrir o JSON malformado, barrado antes do middleware.
- **`configureApp`** (`src/configure-app.ts`): `trust proxy`, helmet e CORS dependem da aplicação já criada, então ficam numa função chamada pelo `main.ts` e pelo `createTestApp`, para os testes rodarem com a mesma configuração.
- **helmet com a CSP padrão**: o Swagger UI do `@nestjs/swagger` só carrega scripts de arquivo (`/docs/*.js`), então funciona sem exceção na CSP (verificado no navegador).
- **CORS por `CORS_ORIGINS`** (lista separada por vírgula). Vazio, que é o padrão em todo ambiente, não envia header CORS nenhum: o navegador bloqueia qualquer outra origem. Sem `credentials` (token vai no header), e o `x-request-id` é exposto.
- **Limite de login com `@nestjs/throttler`**, só na rota de login (`@UseGuards(ThrottlerGuard)`), por IP, `LOGIN_RATE_LIMIT` tentativas (5) a cada `LOGIN_RATE_TTL` segundos (60). Conta tentativas certas e erradas. Contagem em memória: cada instância da API conta à parte e reiniciar zera; sem Redis por decisão. Nos testes o limite é 1000, e o teste do 429 sobe uma aplicação com o valor real.
- **`TRUST_PROXY`** (padrão 0): quantos proxies à frente da API são confiáveis para ler o `X-Forwarded-For`. Valor maior que o real deixa o cliente forjar o IP e escapar do limite; valor menor faz todos os clientes atrás do proxy dividirem a mesma contagem. **Limitação conhecida no compose**: o nginx não repassa o IP e o compose usa 0, então quem entra pela porta 8080 divide uma contagem só (um atacante pode bloquear o login de todos por 1 min). Corrigir exige `TRUST_PROXY=1`, o nginx definir `X-Forwarded-For` e a porta 3000 deixar de ser publicada, senão o acesso direto forja o IP.
- **Configuração validada no boot** (`src/config/app-config.ts`): `loadAppConfig` lê o `process.env`, converte e junta todos os problemas num `InvalidEnvError`, sem nunca mostrar os valores. Quem precisa de configuração injeta `AppConfig` (classe abstrata como token, como o `Clock`). O `ConfigModule` só carrega o `.env`. A validação roda numa fábrica de provider, não no `validate` do `ConfigModule`, porque esse roda uma vez ao importar o módulo e os testes sobem aplicações com variáveis diferentes.
- **`JWT_SECRET` com pelo menos 32 caracteres**; em `NODE_ENV=production` o valor de exemplo do `.env.example` é recusado (um teste confere que a constante e o arquivo batem). A imagem Docker roda em produção, então o compose exige um segredo próprio no `.env`.
- **Swagger desligado em produção por padrão** (`SWAGGER_ENABLED`). O compose liga, porque é a demonstração local.
- **Erros no Swagger** (`common/errors/api-errors.decorator.ts`): `@ApiErrors(...)` documenta só os status que a rota devolve, todos com o `ErrorResponseDto` (que `implements ErrorResponse`, o tipo que o filtro monta), e acrescenta o 500 em toda rota. O documento é montado por `buildOpenApiDocument` (`src/openapi.ts`), usado pelo `/docs`, pelo export e por um teste que confere o schema em toda resposta 4xx/5xx.
- **Contrato OpenAPI versionado**: `npm run contract:generate` compila a API, exporta `apps/api/openapi.json` (`src/scripts/export-openapi.ts`, a partir do `dist/`, porque o `tsx` não emite os metadados de tipo que o Swagger lê) e gera `apps/web/src/lib/api-types.ts` com `openapi-typescript`. Só os tipos, sem cliente nem hooks gerados. `npm run check:contract` regenera e falha se os dois arquivos mudarem, ou seja, se alguém alterou a API sem regenerar. Os dois ficam fora do Prettier e do ESLint.
- **Healthchecks no compose**: `db` com `pg_isready`; `api` com `fetch` do Node no `/health` (a imagem não tem curl), saudável só com API e banco respondendo. Ordem de subida: `db` saudável → `migrate` termina com 0 → `api` saudável → `web`. Cada verificação do healthcheck gera uma linha no log de requisição (a cada 10 s).
- **`GET /users` só para supervisor** (`@Roles`): é quem escolhe responsável na criação e na atribuição. Devolve só `id`, `name` e `role` (`select` como lista de permissão), em ordem de nome com desempate por `id`. O operador não precisa da lista: o responsável dele é sempre ele mesmo.
- **Cobertura da API somando unitários e e2e** (`apps/api/jest-coverage.json`, `npm run test:cov`): os controllers, guards e o filtro só rodam nos e2e, então medir só os unitários (35%) não diria nada. Fora da conta: código gerado, DTOs, módulos, `main.ts` e scripts. Medido no Dia 5: 100% de linhas e 90,5% de branches (o que falta é quase todo o código que o TS emite para os decorators). Thresholds: 90% por arquivo só em `work-order.policy.ts`, `work-order-query.ts` e `error-mapper.ts`; global modesto 80/70/80/80 (statements/branches/functions/lines), aprovado pelo dono no Dia 5. O e2e passou a usar `rootDir` da API com `roots: ["test"]`, para os arquivos de `src` entrarem na cobertura.
- **Cobertura do web** com `@vitest/coverage-v8` (`npm run test:cov -w @opsboard/web`): medido 91,4% de linhas e 80,3% de branches; global modesto 80/70/80/80, aprovado pelo dono no Dia 5. O relatório de texto omite arquivos com 100%.
- **TanStack Query** (`lib/query-client.ts`): repete no máximo 1 vez e só falha de rede ou 5xx (4xx é resposta definitiva). `refetchOnWindowFocus` desligado: num painel interno a pessoa alterna muito de aba, e os dados se atualizam ao mudar filtro ou página. A chave da lista são os próprios `ListParams` normalizados, e o cache é limpo quando a sessão cai.
- **Tema** (Tailwind 4, `src/index.css`): cores em variáveis CSS trocadas pelo `data-theme` do `<html>` e expostas ao Tailwind com `@theme inline`, então os componentes não usam `dark:`. Um script inline no `index.html` aplica o tema antes do React (sem piscar); a escolha fica no localStorage (`opsboard.theme`), e sem escolha vale a preferência do sistema.
- **Lista de ordens** (`pages/OrdersPage.tsx`): `useListParams` lê e escreve a URL com `navigate` (o `setSearchParams` escaparia as vírgulas) e corrige com `replace` a URL fora da forma canônica. Página além do fim vai para a última existente, também com `replace`. A busca guarda o texto no campo e só escreve na URL após 300 ms (ou Enter). "De" depois de "até" não consulta a API: o erro aparece no campo.
- **Estados da lista**: a página guarda a última resposta boa (com os filtros e o instante da busca) porque o `data` do TanStack Query some no erro; assim o erro aparece acima da lista anterior em vez de apagá-la. Esse instante também é o `now` do selo "Atrasada". Vazio total e vazio por filtro se distinguem pelos filtros da resposta, sem requisição extra. Erro fora do formato da API (proxy respondendo com a API fora) tem mensagem de "não foi possível falar com o servidor".
- **Filtros recolhidos no celular**: só a busca fica sempre visível; o resto abre num botão "Filtros (N)" com `aria-expanded`, para a lista aparecer na primeira tela. No desktop o painel fica sempre aberto. Com erro no prazo, o painel abre sozinho.
- **Telas de ordem** (Dia 7): criar (`/orders/new`), detalhe (`/orders/:id`) e editar (`/orders/:id/edit`). O formulário é um só (`WorkOrderForm`), com resumo de erros que recebe o foco ao falhar o envio (cada item é um link que foca o campo). A edição guarda a primeira versão carregada como base: um 409 busca o detalhe de novo sem apagar o que foi digitado. O PATCH leva só o que mudou (a API checa a permissão pelos campos enviados); sem mudança, não chama a API.
- **Foco depois das ações**: o botão clicado costuma sumir (Iniciar vira Concluir; Cancelar some), então o foco vai para o título da ordem, e o aviso sai na região `role="status"`. O `<dialog>` devolve o foco ao botão que o abriu, ou ao título se ele não existir mais.
- **Estado final**: a ordem fica somente leitura; para supervisor, só "Excluir ordem" continua (a API permite excluir em qualquer estado).
- **Linha do tempo do histórico**: `<ol aria-label="Histórico da ordem">` sob um h2 "Histórico"; o ícone de cada tipo é decorativo (`aria-hidden`) e o significado está sempre na frase. Ao trocar de página o foco vai para o título da seção, e a página anterior fica na tela com `aria-busy` até a próxima chegar. Erro, carregamento e vazio ficam dentro da seção: um erro no histórico não esconde o resto do detalhe.
- **CSV em funções puras** (`work-orders/csv/`): leitura, validação, neutralização e montagem do CSV não tocam no Prisma; o service só orquestra. `csv-parse`/`csv-stringify` fazem o parsing e as aspas (nada escrito à mão) e o `luxon` resolve o fim do dia no `APP_TIMEZONE`.
- **Exportação com `take: max + 1`**: uma consulta só, com o mesmo `where`/`orderBy` da lista. Se vier a linha extra, o resultado passou do teto e a resposta é 422, sem `count` separado nem transação.
- **`APP_TIMEZONE` só com nome IANA**: o Luxon aceita um offset solto (`-03:00`), que ignoraria mudanças de horário; a validação exige um nome como `America/Sao_Paulo` ou `UTC`.
- **Importação reaproveita a gravação da criação** (`insertWorkOrder` em `work-orders.service.ts`): recebe o cliente da transação, grava a ordem e o `CREATED`; a criação pela API e a importação passam por ela. A importação valida tudo antes, resolve os e-mails numa consulta só (`UsersService.findIdsByEmails`) e grava numa `$transaction` interativa com timeout de 60 s (500 linhas são 1.000 INSERTs).
- **Limites de texto num lugar só** (`work-orders/work-order-limits.ts`): os DTOs de criação e edição e a validação do CSV usam as mesmas constantes.
- **Upload só em memória**: `FileInterceptor` sem `storage`/`dest` guarda o arquivo em `file.buffer`. O `UploadErrorsInterceptor` fica antes dele e traduz os erros do Multer: arquivo acima de 1 MB → 413 `PAYLOAD_TOO_LARGE`; campo errado ou arquivo a mais → 400 `IMPORT_FILE_INVALID`. Os guards rodam antes, então operador recebe 403 sem o arquivo ser lido.
- **Prazo vazio na importação é `REQUIRED`**: o formato diz que só `title` e `priority` são colunas obrigatórias, mas a criação exige prazo e `dueDate` é `NOT NULL`. A coluna pode faltar no cabeçalho, e aí cada linha acusa `REQUIRED` no prazo.
- **`client_max_body_size 2m` no nginx**: o padrão (1m) responderia 413 em HTML antes da API, sem o formato de erro.
- **Tela de importação** (`pages/ImportOrdersPage.tsx`): campo de arquivo com `<label>`, dica e erro ligados por `aria-describedby`; o resumo da validação fica numa região `aria-live="polite"` e recebe o foco. A tabela de erros tem `caption`, `scope="col"` e `scope="row"`, e fica num contêiner com `tabIndex=0` (borda `--control-border`) que rola sozinho, sem largura mínima: em 375 px ela cabe inteira e a página nunca rola na horizontal. Mensagens sempre em texto, nunca só pela cor. Operador que abre a URL vê "Acesso negado" (a API também recusa com 403). Contraste medido nos dois temas: texto a partir de 6,19:1 no claro e 8,87:1 no escuro.
- **Exportação na lista**: o botão tem `aria-describedby` com "Exporta os N resultados filtrados", fica desabilitado sem resultados e durante o download ("Exportando…"), e o erro aparece num `role="alert"` inserido já com o texto.
- **Acessibilidade**: contraste medido por script nos dois temas (texto, selos e foco acima de 5:1); campos usam `--control-border` (3:1, WCAG 1.4.11), e `--border` fica só para o que é decorativo. `aria-live` com "N ordens encontradas", foco no título "Resultados" ao trocar de página, link "Pular para o conteúdo", e animações desligadas com `prefers-reduced-motion`.
