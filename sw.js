// Guarda só os arquivos do app, para abrir rápido e permitir instalar.
// As matérias vêm sempre da API do GitHub (nunca passam por este cache).
// A cada publicação: aumente VERSAO aqui e o "?v=" de app.js e estilo.css no
// index.html, para nenhum aparelho misturar arquivos de versões diferentes.
const VERSAO = "leitor-v7";
const ARQUIVOS = ["./", "index.html", "logica.js?v=7", "app.js?v=7", "estilo.css?v=7", "manifest.webmanifest", "icone-192.png", "icone-512.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin || evento.request.method !== "GET") return;
  // Rede primeiro (pega atualizações do app); cache se estiver sem internet.
  // "no-cache" pede ao servidor a versão atual em vez de usar a cópia de até
  // 10 min que o navegador guarda dos arquivos do GitHub Pages.
  evento.respondWith(
    fetch(evento.request, { cache: "no-cache" })
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request)),
  );
});
