// Service worker: tenta sempre a versão nova pela internet; sem internet, usa a cópia guardada.
const CACHE = 'jogo';
const ARQUIVOS = [
  './', './index.html', './estilo.css', './placar.css', './config.js', './placar.js',
  './placar-ui.js', './regras.js', './jogo.js', './pwa.js', './manifest.webmanifest',
  './icone-192.png', './icone-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) =>
    Promise.allSettled(ARQUIVOS.map((arquivo) => cache.add(arquivo)))));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(pedido).then((guardada) => guardada || caches.match('./index.html')))
  );
});
