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
em `sw.js` e o `?v=` de `app.js` e `estilo.css` no `index.html`, com o mesmo
número, para os aparelhos pegarem a versão nova sem misturar arquivos.

## Testes

```bash
node --test 'testes/*.test.js'
```

`testes/logica.test.js` cobre a lógica em `logica.js` (ler e editar o
`feeds.txt`, juntar os lidos dos dois aparelhos, tempo relativo).
`testes/publicacao.test.js` confere o que já quebrou o app no celular: versões
iguais em `index.html` e `sw.js`, botões de cancelar sem exigir campos, ids
que o `app.js` usa. Rodam no GitHub Actions a cada push.

