/* Service worker só das notificações. O Firebase exige que ele se chame
   assim e fique na raiz do site. É ele que mostra o aviso quando o app
   está fechado. Os dados aqui são públicos, como no firebase-config.js. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCqPLDG9aj92SE__wvQnNTQ4FvFizdnUZM",
  authDomain: "palpiteiro-7b202.firebaseapp.com",
  projectId: "palpiteiro-7b202",
  storageBucket: "palpiteiro-7b202.firebasestorage.app",
  messagingSenderId: "547352351575",
  appId: "1:547352351575:web:b84e97bc55511ca2112412"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(m => {
  const d = (m && m.data) || {};
  const titulo = d.titulo || "Palpiteiro";
  self.registration.showNotification(titulo, {
    body: d.texto || "",
    icon: "/icon-192.png?v=3",
    badge: "/icon-192.png?v=3",
    tag: d.tag || "palpiteiro",
    data: {url: d.url || "/"},
    renotify: false
  });
});

// Tocar no aviso abre o app na tela certa, sem abrir uma aba a mais.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(clients.matchAll({type: "window", includeUncontrolled: true}).then(abertas => {
    for (const c of abertas) {
      if (c.url.startsWith(self.location.origin) && "focus" in c) {
        if ("navigate" in c) c.navigate(alvo).catch(() => {});
        return c.focus();
      }
    }
    return clients.openWindow(alvo);
  }));
});
