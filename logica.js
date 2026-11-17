// Lógica sem tela nem rede, usada pelo app.js e testada em testes/.
// No navegador vira funções globais; no Node, um módulo (require).

// Mesmo formato que o filtro.py lê: "[Pasta]" e "URL | Nome | filtrar".
function lerFeeds(texto) {
  const feeds = [];
  let pasta = "Feeds";
  for (const bruta of texto.split("\n")) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    if (linha.startsWith("[") && linha.endsWith("]")) {
      pasta = linha.slice(1, -1).trim();
      continue;
    }
    const [url, nome, opcoes = ""] = linha.split("|").map((p) => p.trim());
    const filtrar = opcoes.split(/[\s,]+/).some((o) => o.startsWith("filtrar"));
    feeds.push({ url, nome: nome || url, pasta, filtrar });
  }
  return feeds;
}

// Acrescenta a linha do feed no fim da pasta, criando a pasta se não existir.
function incluirNoFeedsTxt(texto, pasta, linhaNova) {
  const linhas = texto.replace(/\n+$/, "").split("\n");
  const cabecalho = linhas.findIndex((l) => l.trim() === `[${pasta}]`);
  if (cabecalho === -1) return `${linhas.join("\n")}\n\n[${pasta}]\n${linhaNova}\n`;
  // Depois do último feed da pasta (antes da próxima "[Pasta]").
  let fim = cabecalho + 1;
  for (let i = cabecalho + 1; i < linhas.length && !linhas[i].trim().startsWith("["); i++) {
    if (linhas[i].trim()) fim = i + 1;
  }
  linhas.splice(fim, 0, linhaNova);
  return `${linhas.join("\n")}\n`;
}

// O que fica gravado em lidos.json: o que está no GitHub + o que marquei
// aqui - o que desmarquei aqui, só entre as matérias que ainda existem.
function unirLidos(remoto, pendentes, existentes) {
  const unidos = new Set(remoto);
  pendentes.add.forEach((g) => unidos.add(g));
  pendentes.remove.forEach((g) => unidos.delete(g));
  const validos = new Set(existentes);
  return [...unidos].filter((g) => validos.has(g)).sort();
}

function tempoRelativo(dataRss, agora = Date.now()) {
  const data = new Date(dataRss);
  if (isNaN(data)) return "";
  const minutos = Math.round((agora - data) / 60000);
  if (minutos < 60) return `${Math.max(minutos, 1)} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} h`;
  return data.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

// Texto do divisor de data na lista: "Hoje", "Ontem" ou o dia por extenso,
// sempre pelo dia no fuso do aparelho.
function rotuloDoDia(dataRss, agora = new Date()) {
  const data = new Date(dataRss);
  if (isNaN(data)) return "";
  const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diferenca = Math.round((dia(agora) - dia(data)) / 86400000);
  if (diferenca === 0) return "Hoje";
  if (diferenca === 1) return "Ontem";
  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(data.getFullYear() !== agora.getFullYear() ? { year: "numeric" } : {}),
  });
}

// dados/texto/<id>.json vem em blocos (formato 2) ou, nas matérias antigas,
// como lista de parágrafos.
function blocosDoTexto(dados) {
  if (!dados) return [];
  if (Array.isArray(dados.blocos)) return dados.blocos;
  return (dados.paragrafos || []).map((texto) => ({ tipo: "p", partes: [{ texto }] }));
}

// Endereço que pode virar link ou imagem: só http(s) absoluto, nada de
// "javascript:" ou "data:" vindo do site de origem.
function linkSeguro(endereco) {
  try {
    const url = new URL(String(endereco ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// "2026-11-16T06:38" (hora do site, sem fuso) -> "16 nov, 06:38".
function dataDoComentario(data) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(data || "");
  if (!partes) return "";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(partes[3])} ${meses[Number(partes[2]) - 1]}, ${partes[4]}`;
}

// O texto já abre com uma foto (nos primeiros blocos)? Aí a capa que vem do
// feed sobra: muitas vezes é a mesma foto com outro endereço.
function capaNoTexto(blocos) {
  return blocos.slice(0, 3).some((b) => b.tipo === "img");
}

// Depois de gravar no GitHub, tira dos pendentes só o que foi enviado. O que
// foi marcado enquanto a gravação estava em andamento continua pendente.
function tirarEnviados(pendentes, enviados) {
  const sobra = (atual, foi) => new Set([...atual].filter((g) => !foi.has(g)));
  return { add: sobra(pendentes.add, enviados.add), remove: sobra(pendentes.remove, enviados.remove) };
}

// Arrastar um item da lista para a esquerda marca como lida (ou não lida).
// direcaoDoArrasto decide, nos primeiros pixels, se o dedo está arrastando o
// item (horizontal) ou rolando a lista (vertical); até 10 px ainda não sabe.
function direcaoDoArrasto(dx, dy) {
  if (Math.hypot(dx, dy) < 10) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? "horizontal" : "vertical";
}

// Só conta para a esquerda e a partir de 30% da largura (no máximo 120 px).
function arrastoCompleto(dx, largura) {
  return dx <= -Math.min(120, largura * 0.3);
}

if (typeof module !== "undefined") {
  module.exports = {
    lerFeeds, incluirNoFeedsTxt, unirLidos, tempoRelativo, rotuloDoDia, blocosDoTexto, linkSeguro, capaNoTexto,
    dataDoComentario, direcaoDoArrasto, tirarEnviados, arrastoCompleto,
  };
}
