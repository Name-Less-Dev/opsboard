# Roteiro do vídeo (gravado pelo Playwright)

O vídeo é gravado automaticamente por `npm run video:demo` (`apps/web/e2e-video/demo.spec.ts`), com
cursor visível e legendas no rodapé. As legendas abaixo também servem de roteiro de voz, se eu quiser
narrar depois. Duração alvo: 2 a 2,5 minutos.

## Como gravar

**Na pilha local** (padrão, http://localhost:8080):

```bash
docker compose up -d --build --wait
npm run db:seed
DEMO_SUPERVISOR_EMAIL=supervisor@opsboard.dev DEMO_SUPERVISOR_PASSWORD=opsboard123 \
DEMO_OPERATOR_EMAIL=ana@opsboard.dev DEMO_OPERATOR_PASSWORD=opsboard123 \
npm run video:demo
```

**Na produção** (exige a URL direta do Neon no `DATABASE_URL` do terminal e a confirmação digitada do
host, antes e depois, por causa do `--reset-demo`):

```bash
ALLOW_DEMO_RESET=true DATABASE_URL='<url direta do Neon>' \
DEMO_SUPERVISOR_EMAIL=supervisora@example.com DEMO_SUPERVISOR_PASSWORD=opsboard-demo \
DEMO_OPERATOR_EMAIL=ana@example.com DEMO_OPERATOR_PASSWORD=opsboard-demo \
npm run video:demo -- --base https://opsboard-sage.vercel.app \
  --api https://opsboard-api-yo0n.onrender.com --reset-demo
```

O `--api` acorda a API (`/health`) antes de gravar; o `--reset-demo` roda o `seed:demo` antes e
depois, para o vídeo começar com os dados limpos e não deixar sujeira.

Saída: `docs/video/opsboard-demo.webm` (fora do git), mais uma captura por cena em
`docs/video/cenas/`, para conferir sem assistir. Sem `ffmpeg` instalado, não há conversão para MP4.

## Cenas

| #   | Tempo     | Na tela                                                                                      | Legenda                                                                                     |
| --- | --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | 0:00–0:07 | Cartão de título                                                                             | **OpsBoard** — painel de ordens de serviço com React, NestJS e PostgreSQL                   |
| 2   | 0:07–0:17 | Login da supervisora (senha mascarada)                                                       | Entrando como supervisora. Todos os dados são fictícios.                                    |
| 3   | 0:17–0:29 | Painel; cursor passa pelos cards                                                             | O painel conta as ordens por status e destaca as atrasadas.                                 |
| 4   | 0:29–0:39 | Clique em **Atrasadas** → lista filtrada                                                     | Cada card abre a lista já filtrada. O filtro fica na URL.                                   |
| 5   | 0:39–0:51 | Abre uma ordem e desce até o **Histórico**                                                   | O histórico mostra quem fez o quê e quando.                                                 |
| 6   | 0:51–1:09 | **Nova ordem** "Trocar lâmpadas do galpão B"; depois **Atribuir** à Ana                      | Criando uma ordem e atribuindo à operadora Ana. Tudo entra no histórico.                    |
| 7   | 1:09–1:31 | Sai; entra como Ana; abre a ordem; **Iniciar** e **Concluir**                                | Como operadora: sem Cancelar, Atribuir ou Excluir. Ela inicia e conclui as próprias ordens. |
| 8   | 1:31–1:41 | Lista filtrada por **Concluída**; **Exportar CSV**                                           | Exportando a lista filtrada em CSV: arquivo baixado.                                        |
| 9   | 1:41–2:05 | Volta à supervisora; **Importar CSV** com erros → relatório; depois arquivo válido → importa | Importação tudo ou nada: com erro, nada é gravado. Arquivo válido: 3 ordens importadas.     |
| 10  | 2:05–2:13 | Painel com os números novos                                                                  | O painel já mostra as novas ordens, sem recarregar.                                         |
| 11  | 2:13–2:25 | Repositório no GitHub, aba Actions e README (se o CI estiver verde); senão, cartão final     | Testes e CI no GitHub Actions. Código e documentação no repositório.                        |

A cena 11 é tolerante a falha: sem rede, com o CI que não esteja verde ou com a página diferente do
esperado, o vídeo termina num cartão com o endereço do repositório.

## O que nunca aparece

- Senha em texto (o campo é do tipo senha; a gravação mostra só os pontos).
- E-mails reais, abas pessoais, extensões, painéis do Render, Vercel ou Neon: o Playwright grava um
  navegador limpo, só com a aba do OpsBoard.

## Depois de gravar

1. Assistir uma vez inteira e aprovar.
2. Publicar no YouTube como **Não listado**.
3. Colocar o link na linha "Vídeo de demonstração" do README, fazer o commit e o push.
