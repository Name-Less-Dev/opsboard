# Roteiro do vídeo (~2 minutos)

Roteiro para eu gravar a demonstração. URLs: front `<URL_DO_WEB>` e API `<URL_DA_API>` (as do
[DEPLOY.md](DEPLOY.md)).

## Preparação (antes de apertar o gravar)

1. **Acordar a API:** abra `<URL_DA_API>/health` e espere aparecer `"status":"ok"`. No plano free ela
   dorme após 15 minutos sem uso e leva cerca de 1 minuto para acordar.
2. **Dados limpos:** rode o `seed:demo` (passo 3 do [DEPLOY.md](DEPLOY.md)), para o painel mostrar as
   30 ordens fictícias e as atrasadas.
3. **Navegador limpo:** abra uma janela anônima, só com a aba do OpsBoard. Nada de favoritos, outras
   abas, e-mail ou notificações; feche o que puder disparar alerta.
4. **Aparência:** tema claro, zoom de 110% a 125% (o texto precisa ficar legível no vídeo), janela de
   cerca de 1280 × 800.
5. **Arquivos à mão:** `docs/examples/ordens-exemplo.csv` aberto na pasta, para a importação. Os
   e-mails de responsável desse arquivo são do seed de desenvolvimento: na demonstração, apague a
   coluna `assigneeEmail` antes, ou use o "Baixar modelo" da própria tela.
6. **Segunda aba pronta:** o repositório no GitHub, na aba Actions (com a última execução verde) e o
   README.

## Cenas

| Tempo     | Na tela                                                                            | Fala sugerida                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:10 | Tela de login                                                                      | "Este é o OpsBoard, um painel de ordens de serviço que eu fiz com React, NestJS e PostgreSQL. Vou entrar como supervisora."                                                |
| 0:10–0:25 | Login com `supervisora@example.com`; painel                                        | "O painel mostra quantas ordens há em cada status e quais estão atrasadas, com prazo vencido e ainda ativas."                                                              |
| 0:25–0:40 | Clique no card **Atrasadas** → lista filtrada                                      | "Cada card leva para a lista já filtrada. O filtro fica na URL, então dá para recarregar ou mandar o link para alguém."                                                    |
| 0:40–0:55 | Abrir uma ordem → detalhe com o **Histórico**                                      | "No detalhe, o histórico mostra quem fez o quê e quando: criação, atribuição, edição e mudanças de status."                                                                |
| 0:55–1:10 | **Nova ordem**, escolher o responsável Ana; depois **Atribuir** ao Bruno           | "Como supervisora, eu crio uma ordem e escolho o responsável. Posso passar para outra pessoa, e isso também entra no histórico."                                           |
| 1:10–1:30 | **Sair**; login com `ana@example.com`; abrir uma ordem de outra pessoa             | "Agora como operadora. Ela vê todas as ordens, mas só inicia e conclui as dela, e não cancela, não exclui e não atribui. A API também recusa: não é só o botão escondido." |
| 1:30–1:45 | Voltar para a supervisora; **Exportar CSV**; **Importar CSV** → Validar → Importar | "Dá para exportar a lista filtrada em CSV e importar ordens em lote. A importação valida antes e é tudo ou nada: se uma linha tiver erro, nada é gravado."                 |
| 1:45–2:00 | Aba do GitHub: **Actions** verde e o README                                        | "Tudo tem testes: unitários, integração com banco real e ponta a ponta com Playwright, rodando no GitHub Actions a cada push. O README explica como rodar e as decisões."  |

## O que NÃO mostrar

- Nenhuma senha real, token, `.env`, painel do Render, do Vercel ou do Neon (eles mostram segredos).
- As credenciais da demonstração podem aparecer: são públicas e estão no README.
- Abas pessoais, e-mail, notificações, área de trabalho, histórico do navegador.
- O terminal com variáveis de ambiente.

## Como gravar e publicar

1. **Gravar:** use o gravador do sistema. No Windows, a Ferramenta de Captura (Win + Shift + S, modo
   vídeo) ou a Xbox Game Bar (Win + Alt + R); no macOS, Cmd + Shift + 5. Grave só a janela do
   navegador, com áudio do microfone.
2. **Revisar:** assista uma vez inteira procurando dados pessoais na tela antes de publicar.
3. **Publicar:** envie ao YouTube como **Não listado** (só quem tem o link vê).
4. **README:** cole o link na linha "Vídeo de demonstração" do topo do README, faça o commit e o push.
