// Confere coisas que já quebraram o app no celular sem nenhum erro de código.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ler = (arquivo) => fs.readFileSync(path.join(__dirname, "..", arquivo), "utf8");
const html = ler("index.html");
const sw = ler("sw.js");

test("index.html e sw.js usam a mesma versão em todos os arquivos", () => {
  // Quando divergem, o celular mistura HTML novo com CSS/JS antigos (16/11/2026).
  const versao = sw.match(/const VERSAO = "leitor-v(\d+)"/)[1];
  const noHtml = [...html.matchAll(/(?:href|src)="([\w.-]+\.(?:js|css))\?v=(\d+)"/g)];
  assert.ok(noHtml.length >= 3, "index.html carrega logica.js, app.js e estilo.css com ?v=");
  for (const [, arquivo, v] of noHtml) {
    assert.equal(v, versao, `${arquivo}?v=${v} no index.html, mas VERSAO é ${versao}`);
    assert.ok(sw.includes(`"${arquivo}?v=${versao}"`), `${arquivo}?v=${versao} falta em ARQUIVOS no sw.js`);
  }
});

test("todo arquivo do app que o sw.js guarda existe", () => {
  const arquivos = JSON.parse(sw.match(/const ARQUIVOS = (\[[^\]]*\])/)[1]);
  for (const arquivo of arquivos) {
    if (arquivo === "./") continue;
    assert.ok(fs.existsSync(path.join(__dirname, "..", arquivo.split("?")[0])), `${arquivo} não existe`);
  }
});

test("logica.js carrega antes do app.js", () => {
  assert.ok(html.indexOf('src="logica.js') < html.indexOf('src="app.js'));
});

test("botões de fechar/cancelar dos diálogos não exigem os campos obrigatórios", () => {
  // Sem formnovalidate, "Cancelar" no "Adicionar feed" pedia o campo obrigatório.
  const botoes = [...html.matchAll(/<button[^>]*value="fechar"[^>]*>/g)].map((m) => m[0]);
  assert.ok(botoes.length >= 2);
  for (const botao of botoes) assert.match(botao, /formnovalidate/, botao);
});

test("todo id que o app.js procura existe no index.html", () => {
  const app = ler("app.js");
  const ids = new Set([...app.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]));
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `#${id} não existe no index.html`);
});
