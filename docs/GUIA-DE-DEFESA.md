# Guia de defesa (para ensaiar)

Material para eu ensaiar conversas técnicas sobre o OpsBoard. Não é para o recrutador. As respostas
descrevem o código como ele é, inclusive o que ficou de fora.

Os pontos marcados com **⚑** foram decisões tomadas pelo assistente durante os dias autônomos (e
registradas nos relatórios). Preciso confirmar que entendi cada um e que concordo com ele.

---

## 1. Autenticação

**Arquivos para abrir:** `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/jwt.strategy.ts`,
`apps/web/src/features/auth/AuthProvider.tsx`.

**O que saber explicar:**

- Login com e-mail e senha (bcrypt), token JWT só com o `sub` e validade de 1 h.
- O `JwtStrategy` busca o usuário a cada requisição: perfil alterado vale na hora e usuário removido
  perde o acesso.
- Os guards são globais (`JwtAuthGuard` e `RolesGuard`); rota aberta precisa de `@Public()`.
- Senha errada e e-mail inexistente dão a mesma mensagem; o e-mail inexistente também roda o bcrypt,
  contra um hash fictício, para o tempo de resposta não denunciar quais e-mails existem.
- No front, o token fica em memória e no `localStorage`; um 401 com token derruba a sessão e leva ao
  login guardando a página de origem.

**Perguntas prováveis:**

1. _Por que guardar o token no `localStorage`?_ Sobrevive ao F5 e não sofre CSRF, porque vai no header
   e não em cookie. O custo é que um XSS consegue ler o token; a validade de 1 h limita o estrago.
2. _Por que buscar o usuário a cada requisição, se o JWT já diz quem é?_ Para o perfil e a existência
   do usuário valerem na hora. Custa uma consulta por requisição, aceitável neste tamanho.
3. _Como você evita força bruta no login?_ Limite por IP com `@nestjs/throttler`, 5 tentativas por
   minuto, só na rota de login. A contagem fica em memória.

**Pergunta armadilha: por que não há refresh token?** Não implementei. Quando o token expira, a pessoa
entra de novo. Para um painel interno com sessão de 1 h foi aceitável. O próximo passo seria um
refresh token rotativo em cookie `httpOnly`.

---

## 2. Permissões

**Arquivos:** `apps/api/src/work-orders/work-order.policy.ts`, `work-order.policy.spec.ts`,
`apps/web/src/features/work-orders/permissions.ts`.

**O que saber explicar:**

- Toda regra de quem pode o quê está em funções puras que devolvem `{ allowed }` ou o motivo; o service
  só traduz o motivo em 403 ou 409.
- O operador cria só para si mesmo, edita título e descrição das próprias ordens ativas e inicia e
  conclui as dele. O supervisor faz tudo, inclusive cancelar, atribuir e excluir.
- O front espelha a política só para esconder botões; quem decide é a API.

**Perguntas prováveis:**

1. _Por que não usar guards do Nest para isso?_ O guard não conhece o estado da ordem (status,
   responsável). `@Roles` ficou só onde o perfil basta: excluir e atribuir.
2. _E se o front e o back divergirem?_ O front só mostra ou esconde; a API recusa com 403. Os testes
   dos dois lados usam a mesma matriz de casos, escrita à mão.
3. _Como você testou a matriz?_ 64 casos (perfil × responsável × status × ação), com o esperado
   escrito numa tabela à mão, para o teste não repetir a lógica testada.

**Pergunta armadilha: e permissões por equipe, ou um operador ver só as ordens dele?** Não existe:
todos os autenticados veem todas as ordens. Seria um filtro obrigatório no `where`, a partir do
perfil.

---

## 3. Fluxo de status

**Arquivos:** `work-order.policy.ts` (grafo `TRANSITIONS`), `work-orders.service.ts`
(`updateIfStatusUnchanged`), `apps/web/src/pages/OrderDetailPage.tsx`.

**O que saber explicar:**

- O grafo: Aberta → Em andamento → Concluída, e cancelar a partir das ativas. Concluída e Cancelada
  são finais.
- 409 para transição fora do grafo e para ordem final; 403 para falta de permissão. O fluxo é checado
  antes da permissão.
- A mudança e o evento ficam na mesma transação, e o `updateMany` exige o status lido antes. Se outra
  requisição mudou a ordem nesse meio-tempo, a resposta é 409 `CONCURRENT_UPDATE`.

**Perguntas prováveis:**

1. _Por que 409 e não 400?_ O pedido é bem formado, mas conflita com o estado atual do recurso. O front
   trata o 409 recarregando a ordem.
2. _Como você evita duas pessoas mudando o status ao mesmo tempo?_ Condicionando o `UPDATE` ao status
   lido. Se nenhuma linha muda, a transação inteira desfaz e a resposta é 409.
3. _Como testou que o evento não fica órfão?_ Com um trigger temporário no Postgres que faz o `INSERT`
   do evento falhar de verdade; o status não muda.

**Pergunta armadilha: dá para reabrir uma ordem concluída?** Não. Estados finais são finais por
regra; reabrir seria uma transição nova no grafo e na política.

---

## 4. Listagem e filtros

**Arquivos:** `apps/api/src/work-orders/work-order-query.ts`,
`apps/web/src/features/work-orders/list-params.ts`, `apps/web/src/pages/OrdersPage.tsx`.

**O que saber explicar:**

- Filtros diferentes se combinam com AND; valores do mesmo filtro, com OR.
- A ordenação desempata por `id`, para a paginação não repetir nem pular itens.
- A URL é a fonte da verdade; a busca tem debounce de 300 ms.
- A contagem e a página são lidas na mesma transação `RepeatableRead`.
- A busca escapa `%`, `_` e `\`.

**Perguntas prováveis:**

1. _Por que pôr os filtros na URL?_ F5, link compartilhado e voltar/avançar reproduzem a mesma tela.
   Valor inválido na URL é descartado, sem quebrar.
2. _Por que desempatar por `id`?_ Sem isso, o Postgres devolve empates em qualquer ordem e a página 2
   pode repetir um item da 1.
3. _Por que `RepeatableRead`?_ Para o `total` e os `items` lerem a mesma foto do banco; no padrão, uma
   ordem criada entre as duas consultas faria os números divergirem.

**Pergunta armadilha: a busca ignora acentos?** Não: "manutencao" não acha "manutenção". A solução
seria a extensão `unaccent` do Postgres. Também é paginação por offset, não por cursor.

---

## 5. Painel

**Arquivos:** `apps/api/src/dashboard/dashboard.service.ts`, `apps/web/src/pages/DashboardPage.tsx`,
`apps/web/src/features/dashboard/dashboard-links.ts`.

**O que saber explicar:**

- Contadores por status com `groupBy` e as atrasadas com a mesma regra da lista (`overdueWhere`).
- Cada card é um link para a lista já filtrada; um teste confere que o link gera o filtro certo.
- Sem atualização automática: `staleTime` de 30 s, botão "Atualizar", e as ações feitas neste
  navegador invalidam o cache.

**Perguntas prováveis:**

1. _O número do card bate com a lista?_ Sim, há um e2e que clica em cada card e compara com o total da
   lista.
2. _Por que não atualizar em tempo real?_ WebSocket e polling estavam fora do escopo. Mudanças de outra
   pessoa aparecem ao clicar em "Atualizar" ou depois de 30 s.
3. _Mediu o desempenho?_ Com `EXPLAIN ANALYZE` em 5.000 ordens; decidi não criar o índice composto
   `(status, dueDate)`, porque o ganho era de 0,7 ms.

**Pergunta armadilha: tem gráfico por período ou por responsável?** Não. A API entrega só os
contadores por status e as atrasadas.

---

## 6. Histórico

**Arquivos:** `apps/api/src/events/event-details.mapper.ts`, `apps/api/src/events/events.service.ts`,
`apps/web/src/features/work-orders/history/describe-event.ts`.

**O que saber explicar:**

- Append-only, gravado na mesma transação da mudança.
- A leitura converte o `payload` bruto em `details` por tipo, sem expor e-mail, hash ou o texto da
  descrição.
- Payload em formato inesperado vira `details: null`, sem derrubar a tela.
- No Swagger, as uniões discriminadas geram tipos certos no front.

**Perguntas prováveis:**

1. _É event sourcing?_ Não. O estado mora na tabela `WorkOrder`; os eventos são auditoria.
2. _Por que não expor o `payload` bruto?_ Ele grava ids e o texto da descrição; a API monta só o que a
   tela precisa, com nomes no lugar dos ids e sem texto.
3. _E se o formato gravado mudar?_ O mapeador valida as chaves e os tipos; qualquer coisa fora do
   esperado vira `details: null` e a tela mostra um texto genérico.

**Pergunta armadilha: o histórico sobrevive à exclusão da ordem?** Não, sai em cascata. Auditoria
completa exigiria exclusão lógica.

⚑ O mapeador foi ajustado ao formato que o Dia 3 de fato gravava (UPDATED como objeto por campo,
ASSIGNED só com ids), em vez de migrar os dados.

---

## 7. CSV (exportação e importação)

**Arquivos:** `apps/api/src/work-orders/csv/import-file.ts`, `csv/import-row.ts`,
`csv/neutralize-cell.ts`; `apps/web/src/pages/ImportOrdersPage.tsx`.

**O que saber explicar:**

- **Exportação:** mesmos filtros da lista, UTF-8 com BOM, `;`, CRLF e neutralização de fórmulas.
  Teto de 10.000 linhas, testado buscando uma linha a mais.
- **Importação:** só supervisor, tudo ou nada, `dryRun` para validar. Relatório por linha e coluna,
  com códigos estáveis. Limites de 1 MB e 500 linhas.

**Perguntas prováveis:**

1. _O que é injeção de fórmula?_ Uma célula começando com `=` vira fórmula no Excel; o `'` na frente
   faz a planilha tratar como texto. O banco guarda o original.
2. _Por que tudo ou nada?_ Importação parcial deixa a pessoa sem saber o que entrou; com `dryRun` ela
   vê todos os erros antes e corrige o arquivo.
3. _Como garantiu a atomicidade?_ Uma `$transaction` interativa; o teste usa um trigger que faz a
   terceira ordem falhar no banco e confere que nada ficou gravado.

**Pergunta armadilha: e se eu importar o mesmo arquivo duas vezes?** Cria tudo duas vezes. Não detecta
duplicadas nem atualiza ordens existentes, e o arquivo exportado não serve de entrada (traz nomes,
não e-mails).

⚑ Prazo vazio na importação é erro `REQUIRED` (o formato pedido dizia "opcional", mas a criação exige
prazo e a coluna é `NOT NULL`). ⚑ Arquivo só com cabeçalho é erro do arquivo. ⚑ No Dia 10, o teste
no app real achou um bug real: célula com quebra de linha isolada saía sem aspas; foi corrigido com
`quoted_match`.

---

## 8. Testes

**Arquivos:** `apps/api/test/csv.e2e-spec.ts` (integração com banco real),
`apps/web/src/pages/CsvPages.test.tsx` (tela com MSW), `apps/web/e2e/` (Playwright).

**O que saber explicar:**

- **Unitários:** funções puras de política, filtros, CSV, mapeadores e configuração.
- **Integração da API:** supertest contra o Postgres `opsboard_test`.
- **Web:** Vitest + Testing Library + MSW, com a rede simulada.
- **e2e:** Playwright contra a pilha compilada e o banco `opsboard_e2e`, com axe nos dois temas.

**Perguntas prováveis:**

1. _Como você sabe que os testes pegam erro de verdade?_ Fiz testes de mutação manuais em vários dias:
   quebrar de propósito a transação, o desempate por `id` e a invalidação de cache, e ver o teste
   falhar.
2. _Como evita teste instável no e2e?_ Sem esperas fixas, só asserções que esperam sozinhas; cada teste
   cria dados com título único e compara por diferença. Rodei a suíte 3 vezes seguidas e com
   `--repeat-each=3` nos testes mais frágeis.
3. _O e2e achou algo?_ Sim: duas violações de acessibilidade (nome acessível dos cards do painel e uma
   lista de definição mal formada) e o bug do aviso de atribuição que sumia.

**Pergunta armadilha: tem teste de carga ou de regressão visual?** Não. O e2e roda só no Chromium e
em série.

⚑ No Vitest, o upload passa por um `fetch` falso (`test/import-api-mock.ts`), porque o `FormData` do
jsdom não atravessa o MSW; o envio real é coberto pelo e2e.

---

## 9. CI

**Arquivos:** `.github/workflows/ci.yml`, `package.json` (scripts `ci`, `e2e`, `docker:ci:*`).

**O que saber explicar:**

- Seis jobs em paralelo: lint e typecheck, API com cobertura, web com cobertura, contrato OpenAPI,
  e2e e Docker Compose.
- Cada passo é um script npm, então qualquer falha se reproduz localmente.
- Nenhum segredo real: o `JWT_SECRET` do job Docker é gerado na hora.

**Perguntas prováveis:**

1. _O que o job `contract` garante?_ Que `openapi.json` e `api-types.ts` foram regenerados depois de
   mudar a API; se alguém esquecer, o `git diff` acusa.
2. _Por que o job Docker usa outro nome de projeto?_ `opsboard-ci`, com `.env.ci` próprio: o
   `down -v` nunca apaga o volume de desenvolvimento.
3. _Por que só 1 retry no CI?_ Para gravar o trace da falha. Teste instável se corrige na causa.

**Pergunta armadilha: tem deploy automático pelo CI?** Não pelo GitHub Actions: o Render e o Vercel
puxam a `main` sozinhos. Também não há proteção de branch por código (é configurada no GitHub).

---

## 10. Deploy

**Arquivos:** `render.yaml`, `apps/web/vercel.json`, `docs/DEPLOY.md`, `apps/api/prisma.config.ts`.

**O que saber explicar:**

- Front no Vercel, com a reescrita das rotas para `index.html` (F5 em rota interna funciona).
- API no Render, a partir do Dockerfile multi-stage.
- Banco no Neon: a aplicação usa a URL com pooler, as migrations a URL direta (`DIRECT_DATABASE_URL`),
  ambas com SSL.
- CORS só com a URL do front.
- O `seed:demo` redefine os dados fictícios, com duas travas.

**Perguntas prováveis:**

1. _Por que a primeira requisição demora?_ O plano free do Render hiberna após 15 minutos sem tráfego
   e leva cerca de 1 minuto para acordar.
2. _Como as migrations rodam em produção?_ Do meu terminal, com a URL direta do Neon, porque o plano
   free do Render não tem comando de pré-deploy e a imagem de runtime não leva o CLI do Prisma. No
   Docker Compose, o serviço `migrate` roda na subida.
3. _Como protegeu os segredos?_ Só nos painéis dos provedores; o histórico do git foi varrido com
   gitleaks antes de o repositório ficar público.

**Pergunta armadilha: isso aguenta produção de verdade?** Não como está: plano free com hibernação,
uma instância só, limite de login em memória, sem monitoramento e com os limites do plano free do
banco. É uma demonstração.

⚑ As migrations de produção rodam manualmente (não "na subida"), pelo motivo acima. ⚑ A API passou a
expor `Content-Disposition` no CORS, para o nome do CSV com front e API em domínios diferentes
(aprovado no Dia 12).
