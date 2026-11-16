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
    const [url, nome, filtro = ""] = linha.split("|").map((p) => p.trim());
    feeds.push({ url, nome: nome || url, pasta, filtrar: filtro.startsWith("filtrar") });
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

if (typeof module !== "undefined") {
  module.exports = { lerFeeds, incluirNoFeedsTxt, unirLidos, tempoRelativo };
}
