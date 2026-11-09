# Decisões de projeto

Formato curto: **contexto**, **decisão**, **alternativa descartada** e **consequência**. Só o que está
no código. O registro completo, dia a dia, fica na seção "Decisões" do [CLAUDE.md](../CLAUDE.md).

## 1. Política de permissões em funções puras

- **Contexto:** quem pode iniciar, concluir, cancelar, editar, atribuir e excluir depende do perfil,
  de ser o responsável e do status da ordem. Espalhar esses `if` pelo service deixaria a regra
  difícil de testar.
- **Decisão:** `apps/api/src/work-orders/work-order.policy.ts` tem só funções puras (`canTransition`,
  `canEditFields`, `canAssign`...) que devolvem `{ allowed }` ou o motivo. O service traduz o motivo
  em status HTTP. A matriz de 64 casos é testada com o esperado escrito à mão.
- **Alternativa descartada:** guards do Nest por rota, ou uma biblioteca de autorização (CASL). Guard
  não enxerga o estado da ordem, e uma biblioteca seria mais uma camada para defender.
- **Consequência:** o front espelha a política em `features/work-orders/permissions.ts` só para decidir
  o que mostrar; se a regra mudar, os dois lados e as duas matrizes de teste mudam juntos.

## 2. 409 (e não 400) nas transições e em ordem finalizada

- **Contexto:** pedir para concluir uma ordem cancelada não é um payload malformado; o pedido é
  válido, mas conflita com o estado atual do recurso.
- **Decisão:** transição fora do grafo dá 409 `INVALID_TRANSITION`; alterar ordem em estado final dá
  409 `ORDER_FINALIZED`; falta de permissão dá 403; payload inválido dá 400. O fluxo é verificado
  antes da permissão.
- **Alternativa descartada:** 400 para tudo, ou 403 antes do fluxo. Com 400, o front não saberia que
  precisa recarregar a ordem.
- **Consequência:** no 409 o front mostra a mensagem do `code` e busca o detalhe de novo, então a tela
  se corrige sozinha quando outra pessoa mudou a ordem.

## 3. Atualização condicionada ao status lido (controle de corrida)

- **Contexto:** duas pessoas podem mudar a mesma ordem quase ao mesmo tempo. Entre ler a ordem (para
  checar a política) e gravar, o status pode ter mudado.
- **Decisão:** status, edição e atribuição usam `updateMany` com `where: { id, status: <status lido> }`,
  na mesma `$transaction` que grava o evento. Se nenhuma linha for afetada, a transação é desfeita e
  a resposta é 409 `CONCURRENT_UPDATE`.
- **Alternativa descartada:** `SELECT ... FOR UPDATE` (trava a linha, mais difícil de testar e de
  explicar) ou coluna de versão (exigiria migration e o front mandar a versão).
- **Consequência:** a corrida no status é barrada sem trava longa. Uma edição concorrente de campos
  com o mesmo status ainda é "a última vence".

## 4. Histórico append-only (e por que não é event sourcing)

- **Contexto:** a ordem precisa mostrar quem fez o quê e quando.
- **Decisão:** a tabela `WorkOrderEvent` recebe um evento por mudança, gravado na mesma transação da
  mudança. Nenhum endpoint edita ou apaga eventos; a leitura monta `details` por tipo
  (`events/event-details.mapper.ts`), sem expor o `payload` bruto, e-mail ou texto da descrição.
- **Por que não é event sourcing:** o estado atual mora na tabela `WorkOrder`, e é dela que lista,
  detalhe e painel leem. Os eventos são um registro de auditoria, não a fonte da verdade. Nada é
  reconstruído a partir deles.
- **Alternativa descartada:** event sourcing (projeções, replay, versionamento de eventos): muito mais
  complexo do que o problema pede.
- **Consequência:** excluir a ordem apaga os eventos em cascata; uma auditoria completa exigiria
  exclusão lógica.

## 5. Filtros, busca, ordenação e página na URL

- **Contexto:** a lista precisa sobreviver a F5, a colar o link para alguém e ao voltar/avançar do
  navegador.
- **Decisão:** a query string é a fonte da verdade (`features/work-orders/list-params.ts`).
  `parseListParams` lê e descarta valor inválido; `serializeListParams` escreve na forma canônica;
  só `toApiQuery` traduz para a API.
- **Alternativa descartada:** estado em memória (Redux, Zustand ou `useState`), que se perde no F5.
- **Consequência:** a mesma URL sempre mostra a mesma tela, e os links do painel para a lista são
  montados com as mesmas funções (com teste).

## 6. `code` de erro estável

- **Contexto:** o front precisa reagir a erros sem depender de texto, que pode mudar.
- **Decisão:** toda resposta de erro tem o mesmo formato (`statusCode`, `code`, `message`, `details`,
  `path`, `timestamp`, `requestId`), montado por um único filtro (`AllExceptionsFilter`). O front
  decide pelo `code`, com as mensagens em `lib/error-messages.ts`. Um teste exige mensagem para cada
  `code` do contrato OpenAPI.
- **Alternativa descartada:** mostrar a `message` da API ao usuário.
- **Consequência:** um código novo na API quebra o build do front até ganhar mensagem; em 500 o
  usuário vê o `requestId`, e o detalhe fica só no log.

## 7. Neutralização de fórmulas no CSV exportado

- **Contexto:** um título como `=HYPERLINK("...")` vira fórmula ao abrir o CSV no Excel ou no
  LibreOffice (injeção de fórmula).
- **Decisão:** toda célula de texto livre que, depois dos espaços iniciais, começa com `=`, `+`, `-`,
  `@`, tab ou CR ganha um `'` na frente (`work-orders/csv/neutralize-cell.ts`). Só na exportação.
- **Alternativa descartada:** recusar esses caracteres na criação (mudaria a regra de negócio) ou
  escapar na tela.
- **Consequência:** o banco guarda o texto original; só o arquivo exportado leva o apóstrofo.

## 8. Importação tudo ou nada, com `dryRun`

- **Contexto:** importar metade de um arquivo deixaria a pessoa sem saber o que entrou.
- **Decisão:** `POST /work-orders/import?dryRun=true` só valida e devolve o relatório por linha;
  `dryRun=false` grava tudo numa transação, ou nada (422 `IMPORT_INVALID`). A gravação reaproveita a
  mesma função da criação normal, e cada ordem ganha o seu evento `CREATED`.
- **Alternativa descartada:** importação parcial (gravar as válidas e devolver as inválidas).
- **Consequência:** a tela tem duas etapas (validar, depois importar), e o botão de importar só libera
  com uma validação sem erros do mesmo arquivo.

## 9. Regra de "atrasada" duplicada no front

- **Contexto:** a lista mostra um selo "Atrasada", mas a resposta da API não traz esse campo.
- **Decisão:** `features/work-orders/overdue.ts` repete a regra da API (`work-order-query.ts`,
  `overdueWhere`): prazo estritamente antes de agora e status `OPEN` ou `IN_PROGRESS`. O "agora" é o
  instante da busca, não o relógio de cada renderização.
- **Alternativa descartada:** acrescentar `overdue` na resposta (mudaria o contrato só para exibição).
- **Consequência:** a API continua sendo a fonte da verdade do filtro `overdue=true`; se a regra mudar,
  os dois lados e os testes mudam juntos.

## 10. Limite de tentativas de login em memória

- **Contexto:** o login precisa resistir a força bruta.
- **Decisão:** `@nestjs/throttler` só na rota de login, por IP: 5 tentativas por minuto
  (`LOGIN_RATE_LIMIT` e `LOGIN_RATE_TTL`), com o IP real atrás de proxy por `TRUST_PROXY`.
- **Alternativa descartada:** Redis para a contagem (fora do escopo do projeto).
- **Consequência:** cada instância conta à parte e reiniciar zera a contagem. Com `TRUST_PROXY` errado,
  ou todos dividem uma contagem, ou o cliente forja o IP.

## 11. e2e contra a pilha compilada, com banco dedicado

- **Contexto:** os testes de ponta a ponta precisam provar que navegador, front, API e banco funcionam
  juntos, sem tocar nos dados de desenvolvimento.
- **Decisão:** o Playwright sobe a API compilada (`start:prod`, porta 3100) e o front compilado
  (`vite preview`, porta 4100), nunca reaproveita servidor de desenvolvimento, e usa o banco
  `opsboard_e2e`, recriado no `globalSetup`. O script do banco recusa qualquer nome que não termine
  em `_e2e` (com teste). Testes seriais, cada um com dados próprios e contagens por diferença.
- **Alternativa descartada:** e2e contra o `npm run dev`, ou API simulada no navegador.
- **Consequência:** a suíte leva cerca de 1 minuto e roda num worker só. Em troca, testa o mesmo
  artefato que vai para produção.
