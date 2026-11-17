// Rodar: node --test testes/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerFeeds, incluirNoFeedsTxt, unirLidos, tempoRelativo, rotuloDoDia, blocosDoTexto, linkSeguro, capaNoTexto, dataDoComentario, direcaoDoArrasto, arrastoCompleto } = require("../logica.js");

const FEEDS_TXT = `# Comentário
# outro

[Tecnologia]
https://www.engadget.com/rss.xml | Engadget | filtrar

[Viagem]
https://www.headforpoints.com/feed/ | Head for Points
https://md.com/sitemap_index.xml#promocao,milhas | Melhores Destinos | filtrar:perfil-viagem.md
https://hfp.com/feed/ | HfP | comentarios
https://x.com/feed/ | X | filtrar comentarios
`;

test("lerFeeds entende pastas, nomes e filtro", () => {
  assert.deepEqual(lerFeeds(FEEDS_TXT), [
    { url: "https://www.engadget.com/rss.xml", nome: "Engadget", pasta: "Tecnologia", filtrar: true },
    { url: "https://www.headforpoints.com/feed/", nome: "Head for Points", pasta: "Viagem", filtrar: false },
    { url: "https://md.com/sitemap_index.xml#promocao,milhas", nome: "Melhores Destinos", pasta: "Viagem", filtrar: true },
    { url: "https://hfp.com/feed/", nome: "HfP", pasta: "Viagem", filtrar: false },
    { url: "https://x.com/feed/", nome: "X", pasta: "Viagem", filtrar: true },
  ]);
});

test("lerFeeds usa a URL como nome e 'Feeds' como pasta quando faltam", () => {
  assert.deepEqual(lerFeeds("https://solto.com/rss\n"), [
    { url: "https://solto.com/rss", nome: "https://solto.com/rss", pasta: "Feeds", filtrar: false },
  ]);
});

test("incluirNoFeedsTxt põe o feed no fim da pasta existente", () => {
  const novo = incluirNoFeedsTxt(FEEDS_TXT, "Tecnologia", "https://x.com/rss | X");
  const feeds = lerFeeds(novo);
  assert.deepEqual(feeds.map((f) => `${f.pasta}/${f.nome}`), [
    "Tecnologia/Engadget", "Tecnologia/X", "Viagem/Head for Points", "Viagem/Melhores Destinos", "Viagem/HfP", "Viagem/X",
  ]);
  assert.ok(novo.startsWith("# Comentário\n# outro\n"), "não mexe nos comentários");
  assert.ok(novo.endsWith("\n") && !novo.endsWith("\n\n"), "termina com uma quebra de linha só");
});

test("incluirNoFeedsTxt cria a pasta nova no fim do arquivo", () => {
  const novo = incluirNoFeedsTxt(FEEDS_TXT, "Esporte", "https://y.com/rss | Y | filtrar");
  assert.ok(novo.endsWith("\n\n[Esporte]\nhttps://y.com/rss | Y | filtrar\n"));
  assert.equal(lerFeeds(novo).at(-1).pasta, "Esporte");
});

test("incluirNoFeedsTxt na última pasta não engole linhas em branco no meio", () => {
  const novo = incluirNoFeedsTxt(FEEDS_TXT, "Viagem", "https://z.com/feed | Z");
  assert.equal(lerFeeds(novo).length, 6);
  assert.ok(novo.includes("X | filtrar comentarios\nhttps://z.com/feed | Z\n"));
});

test("unirLidos junta os dois aparelhos e respeita o que foi desmarcado", () => {
  const remoto = ["a", "b"];                                            // lido no celular
  const pendentes = { add: new Set(["c"]), remove: new Set(["b"]) };    // mudanças no Mac
  assert.deepEqual(unirLidos(remoto, pendentes, ["a", "b", "c", "d"]), ["a", "c"]);
});

test("unirLidos descarta matérias que já saíram do índice", () => {
  const pendentes = { add: new Set(["nova"]), remove: new Set() };
  assert.deepEqual(unirLidos(["velha", "atual"], pendentes, ["atual", "nova"]), ["atual", "nova"]);
});

test("tempoRelativo", () => {
  const agora = Date.parse("2026-11-16T22:00:00Z");
  assert.equal(tempoRelativo("Mon, 16 Nov 2026 21:59:50 +0000", agora), "1 min");
  assert.equal(tempoRelativo("Mon, 16 Nov 2026 21:20:00 +0000", agora), "40 min");
  assert.equal(tempoRelativo("Mon, 16 Nov 2026 17:00:00 +0000", agora), "5 h");
  assert.match(tempoRelativo("Wed, 11 Nov 2026 10:00:00 +0000", agora), /11/);
  assert.equal(tempoRelativo("não é data", agora), "");
});

test("rotuloDoDia: Hoje, Ontem e data por extenso", () => {
  const agora = new Date(2026, 10, 16, 22, 0);                       // 16/11/2026 22h, hora local
  const em = (dia, hora = 12) => new Date(2026, 10, dia, hora).toUTCString();
  assert.equal(rotuloDoDia(em(16, 0), agora), "Hoje");
  assert.equal(rotuloDoDia(em(15, 23), agora), "Ontem");
  assert.equal(rotuloDoDia(em(12), agora), "quinta-feira, 12 de novembro");
  assert.equal(rotuloDoDia(new Date(2025, 11, 31, 12).toUTCString(), agora), "quarta-feira, 31 de dezembro de 2025");
  assert.equal(rotuloDoDia("não é data", agora), "");
});

test("rotuloDoDia agrupa pelo dia local, não pelo dia em UTC", () => {
  const agora = new Date(2026, 10, 16, 12, 0);
  const meiaNoiteEMeia = new Date(2026, 10, 16, 0, 30);
  const quaseMeiaNoite = new Date(2026, 10, 15, 23, 30);
  assert.equal(rotuloDoDia(meiaNoiteEMeia.toUTCString(), agora), "Hoje");
  assert.equal(rotuloDoDia(quaseMeiaNoite.toUTCString(), agora), "Ontem");
});

test("blocosDoTexto aceita o formato novo e o antigo (só parágrafos)", () => {
  const novo = { formato: 2, blocos: [{ tipo: "h", texto: "Seção" }] };
  assert.deepEqual(blocosDoTexto(novo), novo.blocos);
  assert.deepEqual(blocosDoTexto({ paragrafos: ["um", "dois"] }), [
    { tipo: "p", partes: [{ texto: "um" }] },
    { tipo: "p", partes: [{ texto: "dois" }] },
  ]);
  assert.deepEqual(blocosDoTexto(null), []);
});

test("linkSeguro só deixa passar http e https", () => {
  assert.equal(linkSeguro("https://site.com/a?b=1"), "https://site.com/a?b=1");
  assert.equal(linkSeguro("http://site.com"), "http://site.com/");
  for (const ruim of ["javascript:alert(1)", "data:text/html,oi", "  JavaScript:x", "/relativo", "", undefined]) {
    assert.equal(linkSeguro(ruim), null, String(ruim));
  }
});

test("capaNoTexto: o texto já abre com uma foto (então a capa de cima sai)", () => {
  const p = { tipo: "p", partes: [{ texto: "x" }] };
  const img = { tipo: "img", src: "https://e.com/intro-1.jpg", legenda: "" };
  assert.equal(capaNoTexto([p, img, p]), true);      // Engadget: subtítulo e depois a foto
  assert.equal(capaNoTexto([img, p]), true);
  assert.equal(capaNoTexto([p, p, p, img]), false);  // foto mais para baixo é do meio da matéria
  assert.equal(capaNoTexto([]), false);
});

test("dataDoComentario", () => {
  assert.equal(dataDoComentario("2026-11-16T06:38"), "16 nov, 06:38");
  assert.equal(dataDoComentario("2026-12-01T23:05"), "1 dez, 23:05");
  assert.equal(dataDoComentario(""), "");
});

test("direcaoDoArrasto: separa arrastar o item de rolar a lista", () => {
  assert.equal(direcaoDoArrasto(3, 2), null);             // pouco movimento, ainda não sabe
  assert.equal(direcaoDoArrasto(-30, 5), "horizontal");
  assert.equal(direcaoDoArrasto(4, 40), "vertical");
  assert.equal(direcaoDoArrasto(-20, 18), "vertical");    // diagonal conta como rolagem
});

test("arrastoCompleto: só para a esquerda e longe o bastante", () => {
  assert.equal(arrastoCompleto(-150, 412), true);
  assert.equal(arrastoCompleto(-60, 412), false);          // soltou cedo, volta
  assert.equal(arrastoCompleto(150, 412), false);          // para a direita não faz nada
  assert.equal(arrastoCompleto(-100, 300), true);          // tela estreita: 30% da largura
});
