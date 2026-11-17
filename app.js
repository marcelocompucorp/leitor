// Leitor do news_feed: lê as matérias do repositório privado pela API do
// GitHub e grava o que já foi lido em dados/lidos.json, para celular e
// desktop verem a mesma coisa.

const REPO = "marcelocompucorp/news_feed";
const API = `https://api.github.com/repos/${REPO}`;
const ARQ_LIDOS = "dados/lidos.json";

const $ = (seletor) => document.querySelector(seletor);

const estado = {
  aba: "noticias",
  materias: [],          // dados/materias.json
  lidos: new Set(),      // guids lidos (local + remoto)
  pendentes: { add: new Set(), remove: new Set() }, // ainda não gravados no GitHub
  aberta: null,          // matéria na tela de leitura
  selecao: { tipo: "tudo" }, // ou { tipo: "pasta" | "feed", nome }
  feeds: [],             // feeds.txt: { url, nome, pasta, filtrar }
};

// ---------- armazenamento local ----------

function lerLocal(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null ? padrao : JSON.parse(valor);
  } catch {
    return padrao;
  }
}

function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // modo privado ou armazenamento cheio: segue só em memória
  }
}

function salvarLidosLocal() {
  gravarLocal("leitor.lidos", [...estado.lidos]);
  gravarLocal("leitor.pendentes", {
    add: [...estado.pendentes.add],
    remove: [...estado.pendentes.remove],
  });
}

const token = () => lerLocal("leitor.token", "");

// ---------- API do GitHub ----------

class ErroToken extends Error {}

async function github(caminho, opcoes = {}) {
  const resposta = await fetch(caminho.startsWith("http") ? caminho : `${API}${caminho}`, {
    ...opcoes,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opcoes.headers || {}),
    },
  });
  if (resposta.status === 401 || resposta.status === 403) {
    throw new ErroToken(`GitHub respondeu ${resposta.status}`);
  }
  return resposta;
}

async function lerTexto(caminho) {
  const resposta = await github(`/contents/${caminho}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (!resposta.ok) throw new Error(`Falha ao ler ${caminho}: ${resposta.status}`);
  return resposta.text();
}

async function lerArquivo(caminho) {
  const resposta = await github(`/contents/${caminho}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`Falha ao ler ${caminho}: ${resposta.status}`);
  return resposta.json();
}

function paraBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function deBase64(base64) {
  const binario = atob(base64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

// ---------- sincronização dos lidos ----------

let sincronizando = false;
let timerSync = null;

function agendarSync() {
  clearTimeout(timerSync);
  timerSync = setTimeout(sincronizarLidos, 2000);
}

async function sincronizarLidos() {
  if (sincronizando || !token()) return;
  sincronizando = true;
  try {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const resposta = await github(`/contents/${ARQ_LIDOS}`);
      let remoto = [];
      let sha;
      if (resposta.ok) {
        const arquivo = await resposta.json();
        sha = arquivo.sha;
        remoto = JSON.parse(deBase64(arquivo.content)).lidos || [];
      } else if (resposta.status !== 404) {
        throw new Error(`Falha ao ler os lidos: ${resposta.status}`);
      }

      const final = unirLidos(remoto, estado.pendentes, estado.materias.map((m) => m.guid));

      const semMudanca = estado.pendentes.add.size === 0 && estado.pendentes.remove.size === 0;
      if (semMudanca) {
        estado.lidos = new Set(final);
        salvarLidosLocal();
        return;
      }

      const gravacao = await github(`/contents/${ARQ_LIDOS}`, {
        method: "PUT",
        body: JSON.stringify({
          message: "Atualiza matérias lidas",
          content: paraBase64(JSON.stringify({ lidos: final }, null, 1) + "\n"),
          ...(sha ? { sha } : {}),
        }),
      });
      if (gravacao.ok) {
        estado.lidos = new Set(final);
        estado.pendentes = { add: new Set(), remove: new Set() };
        salvarLidosLocal();
        return;
      }
      if (gravacao.status !== 409 && gravacao.status !== 422) {
        throw new Error(`Falha ao gravar os lidos: ${gravacao.status}`);
      }
      // 409/422: alguém (o outro aparelho) gravou antes; relê e tenta de novo
    }
  } catch (erro) {
    tratarErro(erro);
  } finally {
    sincronizando = false;
    desenhar();
  }
}

function marcarLida(guid, lida) {
  if (lida) {
    estado.lidos.add(guid);
    estado.pendentes.add.add(guid);
    estado.pendentes.remove.delete(guid);
  } else {
    estado.lidos.delete(guid);
    estado.pendentes.remove.add(guid);
    estado.pendentes.add.delete(guid);
  }
  salvarLidosLocal();
  agendarSync();
}

// ---------- carregar matérias ----------

async function carregar() {
  if (!token()) {
    abrirConfig("Para começar, cole o seu token do GitHub.");
    return;
  }
  try {
    mostrarStatus("Carregando…");
    const [materias, feeds] = await Promise.all([lerArquivo("dados/materias.json"), lerTexto("feeds.txt")]);
    estado.materias = materias || [];
    estado.feeds = lerFeeds(feeds);
    gravarLocal("leitor.materias", estado.materias);
    gravarLocal("leitor.feeds", estado.feeds);
    esconderStatus();
    desenhar();
    await sincronizarLidos();
  } catch (erro) {
    tratarErro(erro);
  }
}

// ---------- atualizar: dispara o filtro no GitHub Actions ----------

async function atualizar() {
  const botao = $("#atualizar");
  if (botao.classList.contains("girando") || !token()) return;
  botao.classList.add("girando");
  try {
    const inicio = new Date(Date.now() - 5000).toISOString();
    const disparo = await github("/actions/workflows/filtro.yml/dispatches", {
      method: "POST",
      body: JSON.stringify({ ref: "main" }),
    });
    if (!disparo.ok) throw new Error(`Não consegui iniciar o filtro: ${disparo.status}`);
    mostrarStatus("Buscando matérias novas no Engadget…");

    // Acompanha a execução por até 5 minutos.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const resposta = await github(
        `/actions/workflows/filtro.yml/runs?event=workflow_dispatch&per_page=5&created=${encodeURIComponent(">=" + inicio)}`,
      );
      const execucao = (await resposta.json()).workflow_runs?.[0];
      if (execucao?.status === "completed") {
        if (execucao.conclusion !== "success") {
          mostrarStatus("O filtro terminou com erro. Veja a aba Actions no GitHub.");
          return;
        }
        break;
      }
    }
    await carregar();
  } catch (erro) {
    tratarErro(erro);
  } finally {
    botao.classList.remove("girando");
  }
}

// ---------- desenhar ----------

const pastaDe = (m) => m.pasta || "Feeds";

function naSelecao(m) {
  const { tipo, nome } = estado.selecao;
  if (tipo === "pasta") return pastaDe(m) === nome;
  if (tipo === "feed") return m.fonte === nome;
  return true;
}

function visiveis() {
  const selecionadas = estado.materias.filter(naSelecao);
  if (estado.aba === "barradas") return selecionadas.filter((m) => !m.manter);
  const aprovadas = selecionadas.filter((m) => m.manter);
  return $("#so-nao-lidas").checked
    ? aprovadas.filter((m) => !estado.lidos.has(m.guid) || m === estado.aberta)
    : aprovadas;
}

// Pastas e feeds: os do feeds.txt, mais os que só aparecem nas matérias.
function arvore() {
  const pastas = new Map();
  const incluir = (pasta, feed) => {
    if (!pastas.has(pasta)) pastas.set(pasta, new Set());
    if (feed) pastas.get(pasta).add(feed);
  };
  estado.feeds.forEach((f) => incluir(f.pasta, f.nome));
  estado.materias.forEach((m) => incluir(pastaDe(m), m.fonte));
  return pastas;
}

function desenharArvore() {
  const naoLida = (m) => m.manter && !estado.lidos.has(m.guid);
  const contar = (filtro) => estado.materias.filter((m) => naoLida(m) && filtro(m)).length;
  const { tipo, nome } = estado.selecao;

  const item = (classe, rotulo, numero, selecao) => {
    const li = document.createElement("li");
    li.className = classe;
    const botao = document.createElement("button");
    const texto = document.createElement("span");
    texto.textContent = rotulo;
    const qtd = document.createElement("span");
    qtd.className = "numero";
    qtd.textContent = numero || "";
    botao.append(texto, qtd);
    botao.classList.toggle("ativa", selecao.tipo === tipo && selecao.nome === nome);
    botao.addEventListener("click", () => selecionar(selecao));
    li.append(botao);
    return li;
  };

  const lista = [item("pasta", "Tudo", contar(() => true), { tipo: "tudo" })];
  for (const [pasta, feeds] of arvore()) {
    lista.push(item("pasta", pasta, contar((m) => pastaDe(m) === pasta), { tipo: "pasta", nome: pasta }));
    for (const feed of feeds) {
      lista.push(item("feed", feed, contar((m) => m.fonte === feed), { tipo: "feed", nome: feed }));
    }
  }
  $("#arvore").replaceChildren(...lista);
  $("#selecao-titulo").textContent = tipo === "tudo" ? "Tudo" : nome;
}

function selecionar(selecao) {
  estado.selecao = selecao;
  gravarLocal("leitor.selecao", selecao);
  fecharPastas();
  sairDaLeitura();
  desenhar();
  $("#lista-painel").scrollTop = 0;
}

function abrirPastas() {
  document.body.classList.add("pastas-abertas");
  $("#fundo-pastas").hidden = false;
}

function fecharPastas() {
  document.body.classList.remove("pastas-abertas");
  $("#fundo-pastas").hidden = true;
}

function desenhar() {
  const naoLidas = estado.materias.filter((m) => m.manter && !estado.lidos.has(m.guid)).length;
  $("#contador").textContent = naoLidas ? `(${naoLidas})` : "";
  document.title = naoLidas ? `(${naoLidas}) Leitor` : "Leitor";
  $("#filtros").hidden = estado.aba === "barradas";
  desenharArvore();

  const lista = $("#lista");
  lista.replaceChildren();
  const itens = visiveis().sort((a, b) => new Date(b.data) - new Date(a.data));
  let diaAnterior = null;
  for (const materia of itens) {
    const dia = rotuloDoDia(materia.data);
    if (dia !== diaAnterior) {
      const divisor = document.createElement("li");
      divisor.className = "divisor";
      divisor.textContent = dia;
      lista.append(divisor);
      diaAnterior = dia;
    }
    const li = document.createElement("li");
    const lida = estado.aba === "noticias" && estado.lidos.has(materia.guid);
    li.className = lida ? "lida" : "";
    if (materia === estado.aberta) li.classList.add("selecionada");

    if (materia.imagem) {
      const img = document.createElement("img");
      img.className = "miniatura";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.alt = "";
      img.src = materia.imagem;
      li.append(img);
    }

    const info = document.createElement("div");
    info.className = "info";
    const titulo = document.createElement("div");
    titulo.className = "titulo";
    titulo.textContent = materia.titulo;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [tempoRelativo(materia.data), materia.fonte,
      materia.comentarios ? `${materia.comentarios} comentário${materia.comentarios > 1 ? "s" : ""}` : ""]
      .filter(Boolean).join(" · ");
    info.append(titulo, meta);
    if (estado.aba === "barradas") {
      const motivo = document.createElement("div");
      motivo.className = "motivo";
      motivo.textContent = materia.motivo;
      info.append(motivo);
    }
    li.append(info);

    if (estado.aba === "noticias") {
      const ponto = document.createElement("span");
      ponto.className = "ponto";
      li.append(ponto);
    }
    li.addEventListener("click", () => {
      if (li.dataset.arrastou) return;     // o toque terminou um arrasto, não abre
      abrir(materia);
    });
    if (estado.aba === "noticias") permitirArrasto(li, materia);
    lista.append(li);
  }

  const vazio = $("#vazio");
  vazio.hidden = itens.length > 0;
  vazio.textContent = estado.aba === "barradas"
    ? "Nenhuma matéria barrada."
    : "Nada novo por aqui. Toque em ⟳ para buscar matérias novas.";
}

// Arrastar o item para a esquerda (no celular) alterna lida / não lida.
function permitirArrasto(li, materia) {
  const acao = document.createElement("span");
  acao.className = "acao";
  acao.textContent = estado.lidos.has(materia.guid) ? "Não lida" : "✓ Lida";
  li.prepend(acao);

  let inicio = null, direcao = null, dx = 0;
  const mover = (x) => {
    li.style.setProperty("--dx", `${x}px`);
    acao.style.width = `${Math.max(0, -x)}px`;
  };
  const soltar = () => {
    li.classList.remove("arrastando");
    if (direcao === "horizontal") {
      li.dataset.arrastou = "1";
      setTimeout(() => delete li.dataset.arrastou, 0);   // depois do click que vem junto
      if (arrastoCompleto(dx, li.offsetWidth)) {
        const lida = !estado.lidos.has(materia.guid);
        marcarLida(materia.guid, lida);
        const some = lida && $("#so-nao-lidas").checked && materia !== estado.aberta;
        li.classList.add("concluindo");
        mover(some ? -li.offsetWidth : 0);
        setTimeout(desenhar, some ? 200 : 150);
      } else {
        mover(0);
      }
    }
    inicio = null; direcao = null; dx = 0;
  };

  li.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;   // no Mac continua o clique normal
    inicio = { x: e.clientX, y: e.clientY, id: e.pointerId };
    direcao = null; dx = 0;
  });
  li.addEventListener("pointermove", (e) => {
    if (!inicio || e.pointerId !== inicio.id) return;
    const ddx = e.clientX - inicio.x, ddy = e.clientY - inicio.y;
    if (!direcao) {
      direcao = direcaoDoArrasto(ddx, ddy);
      if (direcao === "vertical") { inicio = null; return; }
      if (direcao === "horizontal") { try { li.setPointerCapture(e.pointerId); } catch {} li.classList.add("arrastando"); }
    }
    if (direcao === "horizontal") { dx = Math.min(0, ddx); mover(dx); }
  });
  li.addEventListener("pointerup", soltar);
  li.addEventListener("pointercancel", () => { direcao = direcao === "horizontal" ? "cancelado" : direcao; mover(0); soltar(); });
}

async function abrir(materia, { empilhar = true } = {}) {
  estado.aberta = materia;
  document.body.classList.add("lendo");
  $("#leitura").hidden = false;
  $("#leitura").scrollTop = 0;
  if (empilhar) history.pushState({ lendo: materia.guid }, "");

  const tituloLink = $("#l-titulo-link");
  tituloLink.textContent = materia.titulo;
  if (linkSeguro(materia.link)) tituloLink.href = linkSeguro(materia.link);
  else tituloLink.removeAttribute("href");
  $("#l-meta").textContent = [tempoRelativo(materia.data), materia.fonte, ...(materia.categorias || [])]
    .filter(Boolean).join(" · ");
  const imagem = $("#l-imagem");
  imagem.hidden = !materia.imagem;
  if (materia.imagem) imagem.src = materia.imagem;
  $("#l-motivo").textContent = materia.motivo ? `Filtro: ${materia.motivo}` : "";
  $("#l-link").href = materia.link;
  $("#l-nao-lida").hidden = !materia.manter;

  const texto = $("#l-texto");
  texto.replaceChildren(paragrafo(materia.resumo));
  if (materia.manter && materia.tem_texto) {
    texto.append(paragrafo("Carregando o texto completo…", "aviso"));
    try {
      const dados = await lerArquivo(`dados/texto/${materia.id}.json`);
      if (estado.aberta !== materia) return;
      const blocos = blocosDoTexto(dados).filter((b) => !(b.tipo === "img" && b.src === materia.imagem));
      texto.replaceChildren(...(blocos.length ? blocos.map(montarBloco) : [paragrafo(materia.resumo)]));
      if (capaNoTexto(blocos)) $("#l-imagem").hidden = true;
    } catch (erro) {
      texto.replaceChildren(paragrafo(materia.resumo), paragrafo("Não consegui carregar o texto completo.", "aviso"));
      tratarErro(erro);
    }
  } else if (materia.manter) {
    texto.append(paragrafo("Texto completo indisponível; abra no site.", "aviso"));
  }

  prepararComentarios(materia);
  if (materia.manter && !estado.lidos.has(materia.guid)) marcarLida(materia.guid, true);
  desenhar();
}

// Monta um bloco do texto completo com elementos criados aqui e texto via
// textContent: nada que veio do site é interpretado como HTML.
function montarBloco(bloco) {
  const elemento = (tag, filhos = [], texto) => {
    const el = document.createElement(tag);
    if (texto !== undefined) el.textContent = texto;
    el.append(...filhos);
    return el;
  };
  const partes = (lista = []) =>
    lista.map((parte) => {
      let el = document.createTextNode(parte.texto);
      if (parte.italico) el = elemento("em", [el]);
      if (parte.negrito) el = elemento("strong", [el]);
      const href = parte.link && linkSeguro(parte.link);
      if (href) {
        const a = elemento("a", [el]);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        el = a;
      }
      return el;
    });

  switch (bloco.tipo) {
    case "h":
      return elemento("h2", [], bloco.texto);
    case "lista":
      return elemento("ul", (bloco.itens || []).map((item) => elemento("li", partes(item))));
    case "citacao":
      return elemento("blockquote", partes(bloco.partes));
    case "tabela": {
      const VISIVEIS = 10;
      const linhas = (bloco.linhas || []).map((linha, i) => {
        const tr = elemento("tr", linha.map((celula) => elemento("td", [], celula)));
        if (i >= VISIVEIS) tr.hidden = true;
        return tr;
      });
      const tabela = elemento("table", [
        elemento("thead", [elemento("tr", (bloco.colunas || []).map((c) => elemento("th", [], c)))]),
        elemento("tbody", linhas),
      ]);
      const filhos = [bloco.titulo ? elemento("figcaption", [], bloco.titulo) : null, tabela].filter(Boolean);
      if (linhas.length > VISIVEIS) {
        const botao = elemento("button", [], `Ver todos os ${linhas.length} trechos`);
        botao.addEventListener("click", () => {
          linhas.forEach((tr) => (tr.hidden = false));
          botao.remove();
        });
        filhos.push(botao);
      }
      return elemento("figure", filhos);
    }
    case "img": {
      const src = linkSeguro(bloco.src);
      if (!src) return document.createTextNode("");
      const img = elemento("img");
      img.src = src;
      img.alt = bloco.legenda || "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      const legenda = [bloco.legenda, bloco.credito && `Foto: ${bloco.credito}`].filter(Boolean).join(" · ");
      return elemento("figure", legenda ? [img, elemento("figcaption", [], legenda)] : [img]);
    }
    default:
      return elemento("p", partes(bloco.partes));
  }
}

// Comentários: só são baixados quando você toca em "Ver comentários".
function prepararComentarios(materia) {
  const secao = $("#l-comentarios");
  const botao = $("#l-ver-comentarios");
  const lista = $("#l-lista-comentarios");
  lista.replaceChildren();
  secao.hidden = !materia.comentarios;
  botao.hidden = false;
  botao.disabled = false;
  botao.textContent = `Ver ${materia.comentarios} comentário${materia.comentarios > 1 ? "s" : ""}`;
  botao.onclick = async () => {
    botao.disabled = true;
    botao.textContent = "Carregando comentários…";
    try {
      const dados = await lerArquivo(`dados/comentarios/${materia.id}.json`);
      if (estado.aberta !== materia) return;
      lista.replaceChildren(...(dados?.comentarios || []).map(montarComentario));
      botao.hidden = true;
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = "Não consegui carregar. Tentar de novo";
      tratarErro(erro);
    }
  };
}

function montarComentario(comentario) {
  const li = document.createElement("li");
  li.style.setProperty("--nivel", Math.min(Math.max(comentario.nivel || 1, 1), 5) - 1);
  const cabecalho = document.createElement("div");
  cabecalho.className = "c-cabecalho";
  const autor = document.createElement("b");
  autor.textContent = comentario.autor;
  const data = document.createElement("span");
  data.textContent = dataDoComentario(comentario.data);
  cabecalho.append(autor, data);
  li.append(cabecalho, ...(comentario.paragrafos || []).map((p) => paragrafo(p)));
  return li;
}

function paragrafo(conteudo, classe) {
  const p = document.createElement("p");
  p.textContent = conteudo; // texto puro: nada do site é interpretado como HTML
  if (classe) p.className = classe;
  return p;
}

// Trocar de feed, pasta ou aba volta para a lista. No celular a matéria aberta
// cobre a lista; sem isso a lista mudava por trás e nada aparecia.
function sairDaLeitura() {
  if (!estado.aberta) return;
  if (history.state?.lendo) history.back(); // o "popstate" chama fecharLeitura
  else fecharLeitura();
}

function fecharLeitura() {
  estado.aberta = null;
  document.body.classList.remove("lendo");
  $("#leitura").hidden = true;
  desenhar();
}

// ---------- status, erros e configuração ----------

function mostrarStatus(texto) {
  $("#status").textContent = texto;
  $("#status").hidden = false;
}

function esconderStatus() {
  $("#status").hidden = true;
}

function tratarErro(erro) {
  console.error(erro);
  if (erro instanceof ErroToken) {
    abrirConfig("O GitHub recusou o token (inválido, expirado ou sem permissão). Cole um novo.");
  } else {
    mostrarStatus(navigator.onLine ? `Erro: ${erro.message}` : "Sem internet. Mostrando o que já estava carregado.");
  }
}

function abrirConfig(mensagem = "") {
  $("#token").value = token();
  $("#config-msg").textContent = mensagem;
  if (!$("#config").open) $("#config").showModal();
}

async function testarToken() {
  const valor = $("#token").value.trim();
  const msg = $("#config-msg");
  msg.textContent = "Testando…";
  gravarLocal("leitor.token", valor);
  try {
    const resposta = await github("");
    if (!resposta.ok) throw new Error(`GitHub respondeu ${resposta.status}`);
    msg.textContent = "Token funcionando.";
    $("#config").close();
    carregar();
  } catch (erro) {
    msg.textContent = `Não funcionou: ${erro.message}. Confira se o token tem acesso ao repositório news_feed.`;
  }
}

// ---------- adicionar feed: acrescenta uma linha no feeds.txt ----------

function abrirNovoFeed() {
  fecharPastas();
  const pastas = [...arvore().keys()];
  $("#nf-pastas").replaceChildren(...pastas.map((p) => Object.assign(document.createElement("option"), { value: p })));
  $("#nf-pasta").value = estado.selecao.tipo === "pasta" ? estado.selecao.nome : "";
  $("#nf-msg").textContent = "";
  $("#novo-feed").showModal();
}

async function salvarNovoFeed() {
  const url = $("#nf-url").value.trim();
  const nome = $("#nf-nome").value.trim().replaceAll("|", "/");
  const pasta = $("#nf-pasta").value.trim().replace(/[[\]]/g, "");
  const msg = $("#nf-msg");
  if (!/^https?:\/\/\S+$/.test(url) || !nome || !pasta) {
    msg.textContent = "Preencha o endereço (começando com https://), o nome e a pasta.";
    return;
  }
  if (estado.feeds.some((f) => f.url === url)) {
    msg.textContent = "Esse feed já está na lista.";
    return;
  }
  msg.textContent = "Salvando…";
  try {
    const linha = `${url} | ${nome}${$("#nf-filtrar").checked ? " | filtrar" : ""}`;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const atual = await (await github("/contents/feeds.txt")).json();
      const gravacao = await github("/contents/feeds.txt", {
        method: "PUT",
        body: JSON.stringify({
          message: `Adiciona o feed ${nome}`,
          content: paraBase64(incluirNoFeedsTxt(deBase64(atual.content), pasta, linha)),
          sha: atual.sha,
        }),
      });
      if (gravacao.ok) {
        estado.feeds.push({ url, nome, pasta, filtrar: $("#nf-filtrar").checked });
        $("#novo-feed").close();
        $("#novo-feed-form").reset();
        selecionar({ tipo: "feed", nome });
        atualizar(); // busca as matérias do feed novo
        return;
      }
      if (gravacao.status !== 409 && gravacao.status !== 422) throw new Error(`GitHub respondeu ${gravacao.status}`);
    }
    throw new Error("o arquivo mudou várias vezes seguidas");
  } catch (erro) {
    msg.textContent = `Não consegui salvar: ${erro.message}`;
    if (erro instanceof ErroToken) tratarErro(erro);
  }
}

// ---------- início ----------

function iniciar() {
  estado.materias = lerLocal("leitor.materias", []);
  estado.feeds = lerLocal("leitor.feeds", []);
  estado.selecao = lerLocal("leitor.selecao", { tipo: "tudo" });
  estado.lidos = new Set(lerLocal("leitor.lidos", []));
  const pendentes = lerLocal("leitor.pendentes", { add: [], remove: [] });
  estado.pendentes = { add: new Set(pendentes.add), remove: new Set(pendentes.remove) };
  $("#so-nao-lidas").checked = lerLocal("leitor.soNaoLidas", true);

  document.querySelectorAll(".aba").forEach((botao) =>
    botao.addEventListener("click", () => {
      estado.aba = botao.dataset.aba;
      document.querySelectorAll(".aba").forEach((b) => b.classList.toggle("ativa", b === botao));
      sairDaLeitura();
      desenhar();
    }),
  );
  $("#so-nao-lidas").addEventListener("change", (e) => {
    gravarLocal("leitor.soNaoLidas", e.target.checked);
    desenhar();
  });
  $("#marcar-todas").addEventListener("click", () => {
    for (const m of estado.materias) if (m.manter && !estado.lidos.has(m.guid)) marcarLida(m.guid, true);
    desenhar();
  });
  $("#atualizar").addEventListener("click", atualizar);
  $("#abrir-pastas").addEventListener("click", abrirPastas);
  $("#fundo-pastas").addEventListener("click", fecharPastas);
  $("#abrir-novo-feed").addEventListener("click", abrirNovoFeed);
  $("#nf-salvar").addEventListener("click", salvarNovoFeed);
  $("#abrir-config").addEventListener("click", () => abrirConfig());
  $("#testar-token").addEventListener("click", testarToken);
  $("#voltar").addEventListener("click", () => history.back());
  $("#l-nao-lida").addEventListener("click", () => {
    if (estado.aberta) marcarLida(estado.aberta.guid, false);
    desenhar();
  });
  window.addEventListener("popstate", fecharLeitura);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sincronizarLidos();
    else carregar();
  });
  // O que foi lido no outro aparelho aparece aqui sem precisar recarregar:
  // confere os lidos a cada minuto e a lista inteira a cada 10, só com o app
  // na tela (são chamadas pequenas, bem abaixo do limite da API do GitHub).
  window.addEventListener("focus", sincronizarLidos);
  setInterval(() => {
    if (document.visibilityState === "visible") sincronizarLidos();
  }, 60 * 1000);
  setInterval(() => {
    if (document.visibilityState === "visible") carregar();
  }, 10 * 60 * 1000);

  desenhar();
  carregar();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
}

iniciar();
