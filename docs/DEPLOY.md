# Deploy da demonstração

Três peças, todas em planos gratuitos e sem cartão de crédito:

| Peça  | Provedor | Como                                                                                | Arquivo versionado     |
| ----- | -------- | ----------------------------------------------------------------------------------- | ---------------------- |
| Front | Vercel   | Build do Vite com a raiz em `apps/web`; todas as rotas reescritas para `index.html` | `apps/web/vercel.json` |
| API   | Render   | Contêiner do `apps/api/Dockerfile` (estágio `runtime`), plano free                  | `render.yaml`          |
| Banco | Neon     | Postgres gerenciado, plano free, região AWS us-east-1                               | (painel do Neon)       |

```mermaid
flowchart LR
  navegador[Navegador] -->|HTML/JS| vercel[Vercel: front]
  navegador -->|/work-orders, /auth... com Bearer| render[Render: API NestJS]
  render -->|pooler, SSL| neon[(Neon: Postgres)]
  dev[Seu terminal] -->|migrations e seed:demo, URL direta| neon
```

## Por que estes provedores (pesquisado em novembro de 2026)

| Provedor        | Plano gratuito                                                                        | Cartão          | Escolha                   |
| --------------- | ------------------------------------------------------------------------------------- | --------------- | ------------------------- |
| Render (web)    | 750 h/mês, 512 MB, hiberna após 15 min sem tráfego e leva cerca de 1 min para acordar | Não             | **API**                   |
| Render Postgres | Banco free expira 30 dias depois de criado                                            | Não             | Descartado (expira)       |
| Fly.io          | Sem plano gratuito para contas novas: teste de 7 dias, depois exige cartão            | Depois do teste | Descartado                |
| Koyeb           | 1 serviço free (dorme após 1 h), mas passou a exigir cartão em 2026                   | Sim             | Descartado                |
| Neon            | 1 GB por projeto, 100 CU-h/mês, suspende após 5 min e acorda sozinho na conexão       | Não             | **Banco**                 |
| Supabase        | 500 MB; o projeto pausa após 1 semana sem atividade e precisa ser reativado no painel | Não             | Descartado (pausa manual) |

As condições mudam: confira a página de preços de cada um antes de repetir o deploy.

## Variáveis de produção

Nenhum valor real fica no repositório. Os sensíveis só existem nos painéis.

| Nome                  | Onde                   | Obrigatória     | Exemplo (fictício)                                                                          | Descrição                                                                                                    |
| --------------------- | ---------------------- | --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `VITE_API_URL`        | Vercel (build)         | Sim             | `https://opsboard-api.onrender.com`                                                         | Endereço da API, sem barra no fim. Entra no build; mudar exige novo deploy do front                          |
| `DATABASE_URL`        | Render                 | Sim             | `postgresql://usuario:SENHA@ep-xxx-pooler.us-east-1.aws.neon.tech/opsboard?sslmode=require` | URL **com pooler** do Neon, usada pela aplicação. Com `sslmode=require`                                      |
| `JWT_SECRET`          | Render                 | Sim             | saída de `openssl rand -hex 32`                                                             | Assina os tokens. Em produção a API recusa o valor de exemplo do `.env.example`                              |
| `CORS_ORIGINS`        | Render                 | Sim             | `https://opsboard.vercel.app`                                                               | Só a URL de produção do front, sem barra no fim. Previews do Vercel ficam bloqueados                         |
| `NODE_ENV`            | Render (`render.yaml`) | Sim             | `production`                                                                                | Liga as validações de produção                                                                               |
| `JWT_EXPIRES_IN`      | Render (`render.yaml`) | Sim             | `1h`                                                                                        | Validade do token                                                                                            |
| `SWAGGER_ENABLED`     | Render (`render.yaml`) | Não             | `true`                                                                                      | Liga o `/docs` em produção (é uma demonstração)                                                              |
| `TRUST_PROXY`         | Render (`render.yaml`) | Não             | `1`                                                                                         | Saltos de proxy confiáveis para ler o IP real (limite de login). Ver o risco abaixo                          |
| `APP_TIMEZONE`        | Render (`render.yaml`) | Não             | `America/Sao_Paulo`                                                                         | Fuso do CSV                                                                                                  |
| `PORT`                | Render (automática)    | —               | `10000`                                                                                     | O Render define; a API lê                                                                                    |
| `LOGIN_RATE_LIMIT`    | —                      | Não             | (padrão `5`)                                                                                | Fica no padrão                                                                                               |
| `DIRECT_DATABASE_URL` | **Só no seu terminal** | Para migrations | `postgresql://usuario:SENHA@ep-xxx.us-east-1.aws.neon.tech/opsboard?sslmode=require`        | URL **direta** (sem `-pooler`) do Neon, para `prisma migrate deploy`. Nunca vai para o Render nem para o git |

**`TRUST_PROXY`**: é o número de proxies à frente da API cujo `X-Forwarded-For` é confiável. Valor
menor que o real faz todo mundo dividir a mesma contagem do limite de login (um visitante pode
bloquear o login dos outros por 1 minuto); valor maior deixa o cliente forjar o IP e escapar do
limite. A API valida que é um inteiro ≥ 0 na subida.

**SSL**: as duas URLs do Neon já vêm com `sslmode=require`; não remova. A conexão sem SSL é recusada
pelo Neon.

**Migrations**: no plano free do Render não há comando de pré-deploy, e a imagem de runtime não tem
o CLI do Prisma. As migrations são aplicadas do seu terminal, com a URL direta, sempre que houver
migration nova (hoje são duas). No Docker Compose continua como antes: o serviço `migrate` roda na
subida.

## Passo a passo do zero

Pré-requisito: o repositório no GitHub (o Render e o Vercel puxam o código de lá).

1. **Neon**: crie uma conta, um projeto `opsboard` na região AWS us-east-1 e copie as duas strings de
   conexão do painel (Connect): a **pooled** (host com `-pooler`) e a **direta**.
2. **Migrations** (no seu terminal, na raiz do repositório):
   - Bash: `DIRECT_DATABASE_URL='<url direta>' npm run db:deploy`
   - PowerShell: `$env:DIRECT_DATABASE_URL='<url direta>'; npm run db:deploy; Remove-Item Env:DIRECT_DATABASE_URL`
3. **Dados da demonstração** (pede para digitar o host do banco):
   - Bash: `ALLOW_DEMO_RESET=true DATABASE_URL='<url direta>' npm run seed:demo`
   - PowerShell: `$env:ALLOW_DEMO_RESET='true'; $env:DATABASE_URL='<url direta>'; npm run seed:demo; Remove-Item Env:ALLOW_DEMO_RESET, Env:DATABASE_URL`
4. **Render**: New → Blueprint → conecte o GitHub e escolha o repositório. O Render lê o
   `render.yaml` e pede os valores `sync: false`:
   - `DATABASE_URL`: a URL **pooled** do Neon;
   - `JWT_SECRET`: gere com `openssl rand -hex 32` e cole;
   - `CORS_ORIGINS`: por enquanto `https://exemplo.invalid` (troca no passo 6).
     Espere o deploy ficar "Live" e abra `https://<servico>.onrender.com/health`.
5. **Vercel**: Add New → Project → importe o repositório. Root Directory: `apps/web`. Em Environment
   Variables, `VITE_API_URL` = a URL do Render (sem barra no fim). Deploy.
6. **CORS**: no Render, troque `CORS_ORIGINS` pela URL de produção do Vercel (`https://<projeto>.vercel.app`)
   e salve (o Render reinicia a API).
7. **Smoke test**: `npm run smoke -- https://<servico>.onrender.com https://<projeto>.vercel.app`.

## Redefinir os dados

Repita o passo 3. Ele apaga só usuários, ordens e eventos e recria os dados fictícios.

## Hibernação

A API do plano free dorme após 15 minutos sem tráfego e leva cerca de 1 minuto para acordar. Antes de
uma demonstração, abra `https://<servico>.onrender.com/health` e espere responder. O Neon também
suspende, mas acorda sozinho em poucos segundos na primeira conexão.
