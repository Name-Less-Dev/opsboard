# OpsBoard

Painel de ordens de serviço full-stack: operadores e supervisores acompanham ordens de serviço
(abertura, andamento, conclusão), com histórico de eventos de cada ordem.

> **Status:** em construção. Hoje existem a infraestrutura (Docker, banco, migrations, seed),
> o login com JWT e dois perfis, a proteção de rotas na API e no front, a API de ordens de serviço
> com fluxo de status e registro de eventos, e as telas de ordens: lista com busca, filtros,
> ordenação e paginação; criar, ver, editar, mudar status, atribuir e excluir; e o painel com
> contadores por status e ordens atrasadas; e o histórico de cada ordem como linha do tempo no
> detalhe. Importar e exportar CSV ainda não foi implementado.

## Stack

- **Front:** React 19 + TypeScript + Vite (`apps/web`), Tailwind CSS 4, TanStack Query
- **API:** NestJS 11 + TypeScript (`apps/api`)
- **Banco:** PostgreSQL 17 + Prisma 7
- **Infra local:** Docker Compose (`db`, `api`, `web`)
- **Auth:** JWT (Bearer) com perfis `OPERATOR` e `SUPERVISOR`, senhas com bcrypt
- **Docs da API:** OpenAPI/Swagger
- **Qualidade:** TypeScript estrito, ESLint + Prettier compartilhados, Jest (API), Vitest + Testing Library + MSW (web)

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (com Docker Compose)
- [Node.js 24](https://nodejs.org/) e npm — só para desenvolver fora do Docker

## Rodando com Docker

```bash
cp .env.example .env
```

Troque o `JWT_SECRET` do `.env` por um valor seu, com pelo menos 32 caracteres. A imagem da API roda
com `NODE_ENV=production`, que recusa o segredo de exemplo. Para gerar um:

```bash
openssl rand -base64 32
```

Depois suba tudo:

```bash
docker compose up --build
```

| Serviço  | URL                          |
| -------- | ---------------------------- |
| Web      | http://localhost:8080        |
| API      | http://localhost:3000/health |
| Swagger  | http://localhost:3000/docs   |
| Postgres | `localhost:5432`             |

Entre com uma das [credenciais de demonstração](#credenciais-de-demonstração): a tela inicial deve
mostrar **"API ok"**. O web chama a API pelo caminho `/api`, que o nginx repassa para o serviço `api`.

### Variáveis de ambiente

Ficam no `.env` da raiz (modelo em `.env.example`). A API valida todas ao iniciar: com alguma
inválida, ela não sobe e lista quais estão erradas (sem mostrar os valores).

| Variável                                            | Obrigatória          | Exemplo                                                       | Descrição                                                                                                                                                           |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Não                  | `opsboard`                                                    | Credenciais do Postgres do compose (padrão `opsboard`)                                                                                                              |
| `DATABASE_URL`                                      | Sim (fora do Docker) | `postgresql://opsboard:opsboard@localhost:5432/opsboard`      | Conexão da API e do Prisma no host. No compose, é montada com o host `db`                                                                                           |
| `JWT_SECRET`                                        | Sim                  | saída de `openssl rand -base64 32`                            | Assina os tokens. Mínimo de 32 caracteres; em produção, o valor de exemplo do `.env.example` é recusado                                                             |
| `JWT_EXPIRES_IN`                                    | Sim                  | `1h`                                                          | Validade do token, em segundos ou com unidade `s`, `m`, `h`, `d` (o compose usa `1h`). Não há refresh token                                                         |
| `NODE_ENV`                                          | Não                  | `production`                                                  | `development` (padrão), `production` ou `test`. A imagem Docker usa `production`                                                                                    |
| `PORT`                                              | Não                  | `3000`                                                        | Porta da API (padrão `3000`)                                                                                                                                        |
| `CORS_ORIGINS`                                      | Não                  | `https://ops.example.com`                                     | Origens liberadas, separadas por vírgula, sem barra no fim. Vazio (padrão) libera nenhuma; o front oficial não precisa, porque usa a mesma origem                   |
| `TRUST_PROXY`                                       | Não                  | `1`                                                           | Quantos proxies à frente da API são confiáveis para ler o IP do `X-Forwarded-For` (padrão `0`, ignora o header). Valor maior que o real deixa o cliente forjar o IP |
| `LOGIN_RATE_LIMIT`                                  | Não                  | `5`                                                           | Tentativas de login por IP na janela (padrão `5`)                                                                                                                   |
| `LOGIN_RATE_TTL`                                    | Não                  | `60`                                                          | Tamanho da janela do limite de login, em segundos (padrão `60`)                                                                                                     |
| `SWAGGER_ENABLED`                                   | Não                  | `true`                                                        | Liga o `/docs`. Padrão: ligado fora de produção, desligado em produção. O compose liga, por ser a demonstração local                                                |
| `TEST_DATABASE_URL`                                 | Só para testes       | `postgresql://opsboard:opsboard@localhost:5432/opsboard_test` | Banco dos testes de integração; o nome precisa terminar em `_test`                                                                                                  |

## Autenticação

| Endpoint           | Acesso      | O que faz                                      |
| ------------------ | ----------- | ---------------------------------------------- |
| `POST /auth/login` | Público     | Recebe `{ email, password }` e devolve o token |
| `GET /auth/me`     | Autenticado | Devolve o usuário do token                     |
| `GET /health`      | Público     | Confere a API e a conexão com o banco          |

Qualquer outra rota exige `Authorization: Bearer <token>` (401 sem token válido, 403 com perfil
insuficiente). No Swagger, execute o login, cole o `accessToken` no botão **Authorize** e teste
o `/auth/me`.

## Ordens de serviço

| Endpoint                          | Acesso             | O que faz                                       |
| --------------------------------- | ------------------ | ----------------------------------------------- |
| `POST /work-orders`               | Autenticado        | Cria uma ordem                                  |
| `GET /work-orders`                | Autenticado        | Lista com filtros, busca, ordenação e paginação |
| `GET /work-orders/:id`            | Autenticado        | Mostra uma ordem                                |
| `PATCH /work-orders/:id`          | Conforme as regras | Edita título, descrição, prioridade e prazo     |
| `PATCH /work-orders/:id/status`   | Conforme as regras | Muda o status                                   |
| `PATCH /work-orders/:id/assignee` | Supervisor         | Define ou remove o responsável                  |
| `DELETE /work-orders/:id`         | Supervisor         | Exclui a ordem e seus eventos                   |
| `GET /work-orders/:id/events`     | Autenticado        | Histórico da ordem, mais recente primeiro       |
| `GET /dashboard/summary`          | Autenticado        | Contadores por status e ordens atrasadas        |
| `GET /users`                      | Supervisor         | Lista usuários (id, nome e perfil) por nome     |

`GET /users` existe para o supervisor escolher o responsável (na criação e na atribuição). Devolve
só `id`, `name` e `role`, nunca e-mail ou hash; para operador responde 403.

### Parâmetros de `GET /work-orders`

Todos opcionais. Filtros diferentes se combinam com AND; valores de um mesmo filtro, com OR.

| Parâmetro          | Valores                                                           | Padrão      |
| ------------------ | ----------------------------------------------------------------- | ----------- |
| `page`             | inteiro ≥ 1                                                       | `1`         |
| `pageSize`         | 1 a 100                                                           | `20`        |
| `status`           | `OPEN`, `IN_PROGRESS`, `DONE`, `CANCELLED`, separados por vírgula | sem filtro  |
| `priority`         | `LOW`, `MEDIUM`, `HIGH`, `URGENT`, separados por vírgula          | sem filtro  |
| `assigneeId`       | UUID de um usuário ou `me`                                        | sem filtro  |
| `overdue`          | `true` filtra só atrasadas; `false` não filtra                    | sem filtro  |
| `dueFrom`, `dueTo` | data e hora com fuso (ISO 8601), intervalo inclusivo              | sem filtro  |
| `q`                | trecho do título ou da descrição, até 100 caracteres              | sem busca   |
| `sortBy`           | `createdAt`, `updatedAt`, `dueDate`, `priority`                   | `createdAt` |
| `order`            | `asc`, `desc`                                                     | `desc`      |

A resposta é `{ items, total, page, pageSize, totalPages }`. Valor inválido ou parâmetro desconhecido
dá 400.

### Exemplos com `curl`

Pegue um token e guarde numa variável (precisa do `jq`; sem ele, copie o `accessToken` da resposta):

```bash
TOKEN=$(curl -s localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"ana@opsboard.dev","password":"opsboard123"}' | jq -r .accessToken)
```

Abertas ou em andamento, atrasadas, prazo mais antigo primeiro:

```bash
curl -s "localhost:3000/work-orders?status=OPEN,IN_PROGRESS&overdue=true&sortBy=dueDate&order=asc" -H "Authorization: Bearer $TOKEN"
```

Busca por trecho do título ou da descrição, segunda página de 10:

```bash
curl -s "localhost:3000/work-orders?q=filtro&page=2&pageSize=10" -H "Authorization: Bearer $TOKEN"
```

Minhas ordens urgentes com prazo em novembro (horário de Brasília). Fuso negativo vai como está; um fuso positivo precisa de `%2B` no lugar do `+`, que na URL vira espaço:

```bash
curl -s "localhost:3000/work-orders?assigneeId=me&priority=URGENT&dueFrom=2026-11-01T00:00:00-03:00&dueTo=2026-11-30T23:59:59-03:00" -H "Authorization: Bearer $TOKEN"
```

Resumo do painel:

```bash
curl -s localhost:3000/dashboard/summary -H "Authorization: Bearer $TOKEN"
```

### Histórico

Cada mudança numa ordem grava um evento na tabela `WorkOrderEvent`, na mesma transação da mudança.
O histórico é só de leitura: nenhum endpoint edita ou apaga eventos.

| Evento           | Quando                          | `details`                                                      |
| ---------------- | ------------------------------- | -------------------------------------------------------------- |
| `CREATED`        | Criar a ordem                   | `null` (o status inicial vai em `toStatus`)                    |
| `STATUS_CHANGED` | Iniciar, concluir ou cancelar   | `null` (usa `fromStatus` e `toStatus`)                         |
| `UPDATED`        | Editar título, descrição, etc.  | `{ changes: [{ field, from, to }] }`; descrição só com `field` |
| `ASSIGNED`       | Atribuir ou tirar o responsável | `{ from: { id, name } \| null, to: { id, name } \| null }`     |

- **O que não é exposto**: e-mail, hash de senha e o `payload` bruto gravado no banco. O `actor`
  tem só `id` e `name`, e na edição da descrição sai só o nome do campo, nunca o texto.
- **Formato**: `GET /work-orders/:id/events?page=1&pageSize=20` (`pageSize` de 1 a 100) devolve
  `{ items, total, page, pageSize, totalPages }`, mais recente primeiro, com desempate por `id`.
  Página além do fim devolve `items` vazio com 200; ordem inexistente dá 404; parâmetro
  desconhecido dá 400.
- **Registro antigo em formato inesperado** sai com `details: null`, sem derrubar a leitura.
- **Na tela**: a seção "Histórico" do detalhe mostra a linha do tempo com 10 eventos por página,
  com quem fez, o que fez e quando (no fuso do navegador). Depois de editar, mudar o status ou
  atribuir, o novo evento aparece sem recarregar a página.

```bash
curl -s "localhost:3000/work-orders/<id>/events?pageSize=5" -H "Authorization: Bearer $TOKEN"
```

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

No Swagger, toda rota documenta os status que pode devolver, todos com o schema `ErrorResponseDto`.

### Logs

Cada requisição gera uma linha, com uma lista fechada de campos (nunca corpo, headers, token,
e-mail ou query string):

```
[HTTP] GET /auth/me 200 4ms requestId=0b6d2a4e-… userId=3a7e…
```

Respostas 4xx e 5xx saem como `warn`. Em 5xx, o filtro de erros registra também a stack, com o mesmo
`requestId` que o cliente recebeu.

## Contrato OpenAPI e tipos do front

O documento OpenAPI fica versionado em `apps/api/openapi.json`, e os tipos TypeScript gerados a partir
dele em `apps/web/src/lib/api-types.ts` (só tipos, sem cliente gerado). Não é preciso banco no ar.

Depois de mudar um endpoint ou um DTO:

```bash
npm run openapi:export -w @opsboard/api   # compila a API e escreve apps/api/openapi.json
npm run types:generate -w @opsboard/web   # gera apps/web/src/lib/api-types.ts
```

`npm run contract:generate` roda os dois em sequência. Commite os dois arquivos junto com a mudança.
`npm run check:contract` regenera e falha se algo mudou, o que mostra que a API foi alterada sem
regenerar os tipos.

## Front-end

Ao entrar, a raiz `/` leva ao **Painel** (`/dashboard`). O menu tem "Painel" e "Ordens". Em
`/orders` fica a lista de ordens, com:

- busca e filtros por status, prioridade, "Minhas ordens", "Somente atrasadas" e prazo;
- ordenação e paginação;
- tabela no desktop e cartões no celular.

Cada título leva ao detalhe da ordem (`/orders/:id`).

### Estrutura de pastas (`apps/web/src`)

```
components/            # peças reutilizáveis: Button, Badge, Skeleton, EmptyState, ErrorState,
                       # Pagination, campos de formulário, layout autenticado, alternador de tema
features/auth/         # sessão: AuthProvider e contexto
features/dashboard/    # painel: hook e chave de cache, cards, barra de distribuição, lista de
                       # atrasadas, links para a lista e cálculo de "há N dias"
features/work-orders/  # lista de ordens: parâmetros da URL, hook de dados, filtros, tabela/cartões,
                       # rótulos em português e a regra de "atrasada"
lib/                   # cliente HTTP, mensagens de erro, TanStack Query, tema, formatação de datas,
                       # tipos gerados da API (api-types.ts)
pages/                 # telas ligadas às rotas
test/                  # setup do Vitest e API falsa com MSW
```

### A URL é a fonte da verdade

Filtros, busca, ordenação e página vivem na query string, por exemplo
`/orders?status=OPEN,IN_PROGRESS&priority=URGENT&overdue=true&sortBy=dueDate&order=asc&page=2`.
A tela lê da URL e escreve na URL; não há estado próprio. Por isso recarregar (F5), colar o link em
outra aba e os botões voltar/avançar do navegador reproduzem exatamente a mesma tela.

- Valores padrão não aparecem na URL, e valores inválidos são descartados e corrigidos na hora
  (`page=abc` some), sem quebrar a tela.
- Mudar um filtro, a busca ou a ordenação volta para a página 1.
- A busca espera 300 ms sem digitar antes de ir para a URL (ou vai na hora com Enter).
- Os prazos ficam na URL como data local (`dueFrom=2026-11-04`). Na chamada à API, "de" vira o
  início do dia e "até" o fim do dia no fuso do navegador, em ISO; as datas da lista aparecem no
  fuso do navegador.

### Erros pelo `code`

O cliente HTTP (`lib/api.ts`) transforma toda resposta de erro em um `ApiError` com `statusCode`,
`code`, `message`, `details` e `requestId`. A tela decide pelo `code`, nunca pelo texto da API, e
todas as mensagens para o usuário ficam em `lib/error-messages.ts` (com um texto padrão para
código desconhecido). Sem resposta do servidor, o `code` é `NETWORK_ERROR`. Em erro inesperado
(500) aparece também o `requestId`, para informar ao suporte. Um 401 em qualquer requisição limpa
a sessão e leva ao `/login`.

### Telas de ordem

| Rota               | O que faz                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `/orders/new`      | Cria uma ordem. Operador é sempre o responsável; supervisor escolhe qualquer usuário ou "Sem responsável" |
| `/orders/:id`      | Detalhe com as ações permitidas (editar, iniciar, concluir, cancelar, atribuir e excluir) e o histórico   |
| `/orders/:id/edit` | Edita título e descrição; prioridade e prazo só para supervisor                                           |

- **Cada ação aparece só para quem pode fazê-la**, pela função `getAvailableActions`
  (`features/work-orders/permissions.ts`), que espelha a política da API. Se a API recusar mesmo
  assim, a mensagem vem do `code`.
- **Formulários** com react-hook-form e zod: validação ao sair do campo e no envio, resumo de erros
  que recebe o foco, e os erros 400 da API aparecem no campo certo (pelo `field` do `details`).
- **A edição envia só o que mudou**; sem mudança, avisa e não chama a API.
- **Sem atualização otimista**: o botão fica desabilitado até a API responder. Depois de sucesso, a
  lista e o detalhe são buscados de novo. Num 409 (outra pessoa mudou a ordem, ou ela já foi
  finalizada) aparece a mensagem e o detalhe é recarregado, então a tela se corrige sozinha.
- **Cancelar e excluir pedem confirmação** num `<dialog>` nativo (Esc ou "Voltar" desistem). Excluir
  avisa que o histórico da ordem também é apagado.
- **Prazo**: o campo é uma data; ao salvar vira o **fim desse dia no fuso do navegador** (23:59:59.999
  local), enviado em UTC. Na criação não aceita data anterior a hoje; na edição aceita, como a API.

### Painel

O painel (`/dashboard`) mostra o que `GET /dashboard/summary` devolve, sem métrica calculada à parte:

| Número                         | O que significa                                                      |
| ------------------------------ | -------------------------------------------------------------------- |
| Abertas, Em andamento, etc.    | Quantas ordens existem em cada status (0 quando não há nenhuma)      |
| Atrasadas                      | Ordens com prazo vencido que ainda estão abertas ou em andamento     |
| Total                          | Soma dos quatro status                                               |
| Ativas                         | Abertas + em andamento                                               |
| Barra e tabela de distribuição | Parte de cada status no total, em percentuais inteiros que somam 100 |

- **Regra de atrasada**: prazo anterior ao instante atual e status aberta ou em andamento. Prazo
  igual ao instante atual ainda não é atrasado, e ordem concluída ou cancelada nunca é. Quem conta
  é a API.
- **Atalhos**: cada card abre a lista já filtrada (por exemplo, `/orders?status=OPEN`). O card de
  atrasadas abre `/orders?overdue=true&sortBy=dueDate&order=asc`. "Minhas ordens em aberto" abre
  as ordens abertas e em andamento em que você é o responsável. O total da lista bate com o número
  do card.
- **Ordens atrasadas**: até 10, do prazo mais antigo para o mais novo, cada uma com "há N dias" (ou
  horas). Com mais de 10, aparece "Ver todas as N atrasadas".
- **De onde vem o horário**: "Atualizado às HH:mm" e o "há N dias" usam o `generatedAt` da
  resposta, que é o instante em que a API contou as atrasadas. Esse horário é mostrado no fuso do
  navegador, e o relógio do navegador não entra na conta, para o painel não contradizer a
  contagem do servidor.
- **Quando os números mudam**:
  - O painel não se atualiza sozinho: nada de polling, WebSocket ou atualização ao voltar para a
    aba.
  - Ao abrir a tela, os dados vêm do cache se tiverem menos de 30 s; senão, são buscados de novo.
  - O botão "Atualizar" busca na hora.
  - Criar, editar, mudar status, atribuir ou excluir uma ordem marca o painel como desatualizado,
    então ao voltar a ele os números já refletem a mudança.

### Tema claro e escuro

O tema começa pela preferência do sistema. O botão no cabeçalho ("Tema escuro" / "Tema claro")
alterna e guarda a escolha no `localStorage` (`opsboard.theme`); para voltar a seguir o sistema,
apague essa chave. As cores são variáveis CSS (`src/index.css`), com contraste conferido nos dois
temas.

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

## Limitações conhecidas

- A busca (`q`) diferencia acentos: "manutencao" não acha "manutenção". A solução futura é a extensão `unaccent` do Postgres.
- Hoje todo prazo é obrigatório, então as regras sobre ordens sem prazo não têm efeito prático.
- **Limite de login em memória**: cada instância da API conta à parte e reiniciar zera a contagem. Com várias instâncias, o limite efetivo é multiplicado; resolver exigiria um armazenamento compartilhado (como Redis), fora do escopo.
- **IP atrás do nginx no compose**: o nginx não repassa o IP do cliente e o compose usa `TRUST_PROXY=0`, então quem acessa pela porta 8080 divide uma única contagem de tentativas. Corrigir exige `TRUST_PROXY=1`, o nginx definir `X-Forwarded-For` e a porta 3000 deixar de ser publicada (senão o acesso direto forja o IP).
- **Token no `localStorage`**: sobrevive ao recarregar e não sofre CSRF, mas um XSS consegue lê-lo. A expiração de 1h limita o estrago.
- **Sem refresh token**: quando o token expira, é preciso entrar de novo.
- **Filtro por responsável só via "Minhas ordens"**: a API aceita `assigneeId` com qualquer usuário, mas não há endpoint que liste usuários para montar o seletor.
- **Ações da tela duplicam a política do back** (`features/work-orders/permissions.ts`): o front só decide o que mostrar, e a API continua decidindo o que vale. Se a política mudar, os dois lados e as duas matrizes de teste mudam juntos.
- **Excluir a ordem apaga o histórico dela**: os eventos saem em cascata. Uma auditoria completa exigiria exclusão lógica (marcar a ordem como excluída em vez de apagar).
- **Descrição alterada registra só o campo**: a API mostra que a descrição mudou, não o texto antes e depois.
- **Histórico sem filtros nem exportação**: só a linha do tempo paginada de cada ordem, sem busca e sem feed geral de atividades.
- **O front interpreta `details` pelo contrato gerado** (`api-types.ts`), não pelo JSON bruto do banco: um tipo de evento novo só ganha texto próprio depois de regenerar o contrato e ensinar o `describeEvent`; até lá aparece como "Alteração registrada por …".
- **Painel sem atualização automática**: os números só mudam ao abrir a tela (depois de 30 s), pelo botão "Atualizar" ou depois de uma ação feita neste navegador. Mudanças feitas por outra pessoa só aparecem ao atualizar.
- **Painel sem métricas por responsável, prioridade ou período**: a API entrega só contadores por status e as atrasadas, e o painel não calcula nada por conta própria.
- **Regra de "atrasada" duplicada no front** (`features/work-orders/overdue.ts`): a lista não traz esse campo, então o selo é calculado no navegador com a mesma regra da API. A API continua sendo a fonte da verdade (é ela que filtra `overdue=true`); se a regra mudar, os dois lados e seus testes mudam juntos.

## Testes

```bash
docker compose up -d db
npm test
```

Os testes de integração da API rodam em um banco separado (`opsboard_test`), criado sozinho no mesmo
Postgres. Eles apagam as tabelas desse banco e se recusam a rodar em um banco cujo nome não termine
em `_test`, então o banco de desenvolvimento não é tocado.

Os testes do web usam o MSW para simular a API no nível da rede: cliente HTTP, TanStack Query,
roteador e telas são os reais.

```bash
npm run test:cov
```

Gera a cobertura da API (unitários e integração somados, em `apps/api/coverage`) e do web
(`apps/web/coverage`), e falha abaixo dos limites: 90% em `work-order.policy.ts`,
`work-order-query.ts` e no mapeador de erros, mais um limite global modesto nos dois apps.

## Banco: migrations e seed

As migrations rodam sozinhas: o serviço `migrate` aplica as pendentes (`prisma migrate deploy`)
e termina, e só então a API sobe. A ordem é `db` (saudável) → `migrate` (termina com sucesso) →
`api` (saudável, com `/health` respondendo 200) → `web`.

O seed **não** roda sozinho, porque apaga os dados existentes. Com os serviços no ar:

```bash
docker compose run --rm migrate npx prisma db seed
```

O seed apaga e recria os dados de exemplo (pode ser rodado várias vezes): 1 supervisor,
2 operadores e 10 ordens de serviço com status e prazos variados.

### Credenciais de demonstração

Só para desenvolvimento: o seed se recusa a rodar com `NODE_ENV=production`, e o banco guarda
apenas o hash das senhas.

| Usuário                   | Perfil     | Senha         |
| ------------------------- | ---------- | ------------- |
| `supervisor@opsboard.dev` | SUPERVISOR | `opsboard123` |
| `ana@opsboard.dev`        | OPERATOR   | `opsboard123` |
| `bruno@opsboard.dev`      | OPERATOR   | `opsboard123` |

Os dados ficam no volume `pgdata` e sobrevivem a `docker compose down`.
Para apagar tudo: `docker compose down -v`.

### Seed de volume (opcional)

```bash
npm run seed:large
```

Acrescenta 5.000 ordens com o prefixo `[volume]` no título, para testar paginação e planos de
consulta. Precisa do seed normal antes (usa os mesmos usuários), não apaga nem altera as ordens
dele e, ao rodar de novo, substitui só as ordens `[volume]` da execução anterior (avisando quantas).
Os dados saem iguais a cada execução. Cada ordem ganha um histórico coerente com o status
(criação e mudanças de status), e a ordem `[volume] Ordem com histórico longo` tem 28 eventos,
para paginar a linha do tempo. Não roda com `NODE_ENV=production`.

## Desenvolvimento (hot reload)

Rode só o banco no Docker e os apps no host:

```bash
docker compose up -d db
npm run dev
```

Web em http://localhost:5173 (o Vite repassa `/api` para a API em `:3000`).

## Scripts (raiz)

| Comando                     | O que faz                                               |
| --------------------------- | ------------------------------------------------------- |
| `npm run dev`               | API (watch) e web (Vite) juntos                         |
| `npm run build`             | Build de todos os apps                                  |
| `npm run test`              | Testes de todos os apps                                 |
| `npm run test:cov`          | Testes com cobertura e limites mínimos                  |
| `npm run contract:generate` | Exporta o OpenAPI e gera os tipos do web                |
| `npm run check:contract`    | Falha se o OpenAPI ou os tipos estiverem desatualizados |
| `npm run lint`              | ESLint + verificação de formatação (Prettier)           |
| `npm run format`            | Formata o código com Prettier                           |
| `npm run db:migrate`        | Cria/aplica migrations do Prisma                        |
| `npm run db:seed`           | Popula o banco com dados de exemplo                     |
| `npm run seed:large`        | Acrescenta 5.000 ordens `[volume]` (opcional)           |

## Estrutura

```
apps/
  api/   # NestJS + Prisma (schema, migrations e seed em apps/api/prisma)
  web/   # React + Vite + Tailwind (ver "Front-end")
docker-compose.yml
```
