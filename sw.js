// Service worker: deixa o app instalável e funcionando offline.
//
// - "casca" do app (HTML, CSS, JS, ícones, catálogos) é pré-baixada e servida do cache.
// - imagens do catálogo vão para o cache na primeira vez que são vistas.
// - desenhos gerados por IA ficam no IndexedDB (não passam por aqui).
//
// Ao publicar uma mudança no app, aumente VERSAO para os usuários receberem a atualização.
const VERSAO = 'v1';
const CASCA = `colorir-casca-${VERSAO}`;
const IMAGENS = 'colorir-imagens';

const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/estilo.css',
  'js/app.js',
  'js/acervo.js',
  'js/bd.js',
  'js/ia.js',
  'js/numeros.js',
  'js/numeros-gerador.js',
  'js/numeros-worker.js',
  'js/pintura.js',
  'numeros/numeros.json',
  'desenhos/desenhos.json',
  'icones/icone.svg',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/maskable-512.png',
  'icones/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CASCA).then((c) => c.addAll(ARQUIVOS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n.startsWith('colorir-casca-') && n !== CASCA).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

// O app pede para ativar a nova versão quando o usuário toca em "Atualizar".
self.addEventListener('message', (e) => {
  if (e.data === 'atualizar') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // IA e outros sites: direto na rede

  // Navegação: sempre abre o app (mesmo offline)
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }

  // Imagens do catálogo: cache primeiro, guarda ao baixar
  if (/\/(numeros|desenhos)\/.+\.(png|jpe?g|svg|webp)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(IMAGENS).then(async (c) => {
        const salva = await c.match(req);
        if (salva) return salva;
        const resp = await fetch(req);
        if (resp.ok) c.put(req, resp.clone());
        return resp;
      }),
    );
    return;
  }

  // Casca do app: cache primeiro, rede como reserva
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
