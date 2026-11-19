// Service worker do Palpiteiro: deixa o app instalável, abre rápido
// e mostra uma tela amigável quando o celular está sem internet.
// Ao mudar arquivos do app, aumente a versão abaixo.
const VERSION = "palpiteiro-v15";
const SHELL = [
  "./",
  "index.html",
  "offline.html",
  "gate.js?v=10",
  "firebase-config.js",
  "manifest.webmanifest",
  "icon-192.png?v=3",
  "icon-512.png",
  "apple-touch-icon.png?v=3"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(f => c.add(new Request(f, {cache: "reload"})).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION) && k !== "palpiteiro-sdk").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Páginas: sempre tenta a versão nova; sem internet, mostra a tela offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req, {cache: "no-cache"}).catch(() => caches.match("offline.html")));
    return;
  }

  // Arquivos do próprio app: responde do cache e atualiza por trás.
  if (url.origin === location.origin && !url.pathname.includes("/admin/")) {
    e.respondWith(
      caches.open(VERSION).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Sistema de login (Firebase): os arquivos têm versão no endereço e nunca mudam, então guarda de vez.
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(
      caches.open("palpiteiro-sdk").then(async c =>
        (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })
      )
    );
    return;
  }

  // Fontes do Google: guarda depois do primeiro uso.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(VERSION + "-fonts").then(async c =>
        (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; })
      )
    );
  }
  // O resto (API de jogos, login do Firebase, casa de apostas) vai direto pra internet.
});
