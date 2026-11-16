// Guarda só os arquivos do app, para abrir rápido e permitir instalar.
// As matérias vêm sempre da API do GitHub (nunca passam por este cache).
// Mude VERSAO a cada publicação para os aparelhos pegarem o app novo.
const VERSAO = "leitor-v2";
const ARQUIVOS = ["./", "index.html", "app.js", "estilo.css", "manifest.webmanifest", "icone-192.png", "icone-512.png"];

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
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request)),
  );
});
