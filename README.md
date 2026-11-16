# leitor

App web instalável (PWA) para ler as notícias filtradas pelo repositório
privado `marcelocompucorp/news_feed`.

- Abre em https://marcelocompucorp.github.io/leitor/ no Mac e no Android
  (no Chrome do Android: menu ⋮ → "Adicionar à tela inicial").
- Este repositório tem só o código do app. As matérias, o texto completo e a
  lista do que já foi lido ficam no `news_feed` (privado), em `dados/`, e o
  app os lê pela API do GitHub com um token guardado em cada aparelho.
- ⟳ dispara o workflow "Filtrar feeds" do `news_feed` e recarrega a lista
  quando ele termina.

## Token

Fine-grained, em https://github.com/settings/personal-access-tokens/new:

- Repository access: só `marcelocompucorp/news_feed`
- Permissions: Contents = Read and write; Actions = Read and write

Cole no ⚙ do app, uma vez em cada aparelho.

## Publicar uma mudança

HTML, CSS e JS puros, sem build. Ao mudar qualquer arquivo, aumente `VERSAO`
em `sw.js` para os aparelhos pegarem a versão nova.
