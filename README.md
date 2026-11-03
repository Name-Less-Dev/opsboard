# OpsBoard

Painel de ordens de serviço full-stack: operadores e supervisores acompanham ordens de serviço
(abertura, andamento, conclusão), com histórico de eventos de cada ordem.

> **Status:** em construção. Hoje existem a infraestrutura (Docker, banco, migrations, seed),
> o login com JWT e dois perfis, a proteção de rotas na API e no front, a tela inicial que mostra
> o estado da API e a API de ordens de serviço com fluxo de status e registro de eventos. A tela de
> ordens, filtros, painel, leitura do histórico e CSV ainda não foram implementados.

## Stack

- **Front:** React 19 + TypeScript + Vite (`apps/web`)
- **API:** NestJS 11 + TypeScript (`apps/api`)
- **Banco:** PostgreSQL 17 + Prisma 7
- **Infra local:** Docker Compose (`db`, `api`, `web`)
- **Auth:** JWT (Bearer) com perfis `OPERATOR` e `SUPERVISOR`, senhas com bcrypt
- **Docs da API:** OpenAPI/Swagger
- **Qualidade:** TypeScript estrito, ESLint + Prettier compartilhados, Jest (API), Vitest (web)

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (com Docker Compose)
- [Node.js 24](https://nodejs.org/) e npm — só para desenvolver fora do Docker

## Rodando com Docker

```bash
cp .env.example .env
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

Ficam no `.env` da raiz (modelo em `.env.example`).

| Variável                                            | Para quê                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciais do Postgres                                            |
| `DATABASE_URL`                                      | Conexão usada pela API e pelo Prisma fora do Docker                |
| `JWT_SECRET`                                        | Assina os tokens. **Obrigatória:** sem ela o compose não sobe      |
| `TEST_DATABASE_URL`                                 | Banco dos testes de integração; o nome precisa terminar em `_test` |
| `JWT_EXPIRES_IN`                                    | Validade do access token (padrão `1h`). Não há refresh token       |

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

| Endpoint                          | Acesso             | O que faz                                   |
| --------------------------------- | ------------------ | ------------------------------------------- |
| `POST /work-orders`               | Autenticado        | Cria uma ordem                              |
| `GET /work-orders`                | Autenticado        | Lista paginada (`page`, `pageSize` até 100) |
| `GET /work-orders/:id`            | Autenticado        | Mostra uma ordem                            |
| `PATCH /work-orders/:id`          | Conforme as regras | Edita título, descrição, prioridade e prazo |
| `PATCH /work-orders/:id/status`   | Conforme as regras | Muda o status                               |
| `PATCH /work-orders/:id/assignee` | Supervisor         | Define ou remove o responsável              |
| `DELETE /work-orders/:id`         | Supervisor         | Exclui a ordem e seus eventos               |

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

## Limitações conhecidas

- A busca (`q`) diferencia acentos: "manutencao" não acha "manutenção". A solução futura é a extensão `unaccent` do Postgres.
- Hoje todo prazo é obrigatório, então as regras sobre ordens sem prazo não têm efeito prático.

## Testes

```bash
docker compose up -d db
npm test
```

Os testes de integração da API rodam em um banco separado (`opsboard_test`), criado sozinho no mesmo
Postgres. Eles apagam as tabelas desse banco e se recusam a rodar em um banco cujo nome não termine
em `_test`, então o banco de desenvolvimento não é tocado.

## Banco: migrations e seed

As migrations rodam sozinhas: o serviço `migrate` aplica as pendentes (`prisma migrate deploy`)
e termina, e só então a API sobe. A ordem é `db` → `migrate` → `api` → `web`.

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
