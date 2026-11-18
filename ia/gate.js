// Portão de entrada do Palpiteiro: login (Google ou e-mail + senha),
// pedido de acesso com aprovação manual, registro de uso e bilhetes do dia.
import { firebaseConfig, SDK, ADMINS } from "./firebase-config.js";

const ready = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLE");
window.track = () => {};

let gate = document.getElementById("gate");
if (!gate) { gate = document.createElement("div"); gate.id = "gate"; document.body.appendChild(gate); }

const fail = e => { console.error("Palpiteiro gate", e); if (window.gateFail) window.gateFail(); };

if (!ready) {
  console.warn("Palpiteiro: Firebase ainda não configurado, app aberto sem login.");
  document.body.classList.remove("locked");
  gate.hidden = true;
} else {
  start().catch(fail);
}

async function start() {
  document.body.classList.add("locked");
  gate.hidden = false;

  const timeout = new Promise((_, no) => setTimeout(() => no(new Error("tempo esgotado")), 25000));
  const [{ initializeApp }, A, F] = await Promise.race([Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]), timeout]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app), db = F.getFirestore(app);
  auth.languageCode = "pt-BR";
  A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
  const admins = (ADMINS || []).map(e => String(e).toLowerCase());
  const souAdmin = u => {
    const e = String((u && u.email) || "").toLowerCase();
    return !!e && (admins.includes(e) || adminsExtra.includes(e));
  };
  let unsub = null, unsubTickets = null, unsubOut = null, unsubCasas = null, unsubAdm = null, unsubBan = null, beat = null;
  let adminsExtra = [];

  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inApp = /instagram|fban|fbav|fb_iab|tiktok|musical_ly|bytedance|line\//i.test(ua);
  const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, "");

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const digits = s => String(s || "").replace(/\D/g, "");
  const logo = `<div class="g-logo"><img src="icon-192.png?v=3" alt=""><h1>Palpi<span>teiro</span></h1></div>`;
  const show = html => { gate.innerHTML = `<div class="g-card">${logo}${html}</div>`; gate.scrollTop = 0; };
  const err = msg => { const e = gate.querySelector(".g-err"); if (e) { e.className = "g-err"; e.textContent = msg; e.hidden = false; } };
  const ok = msg => { const e = gate.querySelector(".g-err"); if (e) { e.className = "g-ok"; e.textContent = msg; e.hidden = false; } };
  const busy = on => gate.querySelectorAll("button,input").forEach(b => b.disabled = on);
  const onEnter = btn => gate.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); btn.click(); } }));
  const msgFor = e => {
    const c = (e && e.code) || "";
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "E-mail ou senha incorretos.";
    if (c.includes("invalid-email")) return "E-mail inválido.";
    if (c.includes("email-already-in-use")) return "Esse e-mail já tem cadastro. Toque em Entrar.";
    if (c.includes("weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (c.includes("popup-closed") || c.includes("cancelled-popup")) return "Login com Google cancelado.";
    if (c.includes("too-many-requests")) return "Muitas tentativas. Espere um pouco e tente de novo.";
    if (c.includes("network")) return "Sem conexão. Verifique a internet.";
    if (c.includes("user-disabled")) return "Essa conta foi desativada.";
    return "Não deu certo agora. Tente de novo." + (c ? ` (${c})` : "");
  };

  // Quem chega pelo Instagram/TikTok abre num navegador embutido, onde o Google não deixa entrar nem instalar.
  const inAppNote = () => {
    if (!inApp) return "";
    const intent = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(APP_URL)};end`;
    return `<div class="g-warn"><span>Você abriu pelo <b>Instagram/TikTok</b>. Para entrar com Google e instalar o app, abra no navegador do celular.</span>
      ${ios ? `<span>Toque nos <b>três pontinhos</b> lá em cima e em <b>Abrir no navegador</b>.</span><button id="g-copy">Copiar o link</button>`
            : `<a href="${intent}">Abrir no Chrome</a>`}</div>`;
  };
  const installLink = () => (window.palCanInstall && window.palCanInstall() && !inApp)
    ? `<p class="g-small"><a href="#" id="g-inst">Instalar o app no celular</a></p>` : "";
  const wireCommon = () => {
    const c = gate.querySelector("#g-copy");
    if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(APP_URL); c.textContent = "Link copiado. Cole no Safari"; } catch (e) { c.textContent = APP_URL; } };
    const i = gate.querySelector("#g-inst");
    if (i) i.onclick = e => { e.preventDefault(); window.palInstall && window.palInstall(); };
    const g = gate.querySelector("#g-google");
    if (g) g.onclick = google;
  };
  const gIcon = `<svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

  const loginView = keepMail => {
    show(`<p class="g-sub">Entre para ver os jogos e palpites.</p>
      ${inAppNote()}
      <button class="g-google" id="g-google">${gIcon}Entrar com Google</button>
      <div class="g-or"><span>ou</span></div>
      <input id="g-mail" type="email" inputmode="email" placeholder="E-mail" autocomplete="email" autocapitalize="off" value="${esc(keepMail || "")}">
      <input id="g-pass" type="password" placeholder="Senha" autocomplete="current-password">
      <div class="g-err" hidden></div>
      <button class="g-main" id="g-enter">Entrar</button>
      <p class="g-link">Não tem conta? <a href="#" id="g-tosign">Pedir acesso</a></p>
      <p class="g-small"><a href="#" id="g-forgot">Esqueci a senha</a></p>
      ${installLink()}`);
    wireCommon();
    gate.querySelector("#g-tosign").onclick = e => { e.preventDefault(); signupView(); };
    gate.querySelector("#g-forgot").onclick = async e => {
      e.preventDefault();
      const m = gate.querySelector("#g-mail").value.trim();
      if (!/^\S+@\S+\.\S+$/.test(m)) return err("Digite seu e-mail em cima e toque de novo em Esqueci a senha.");
      try { await A.sendPasswordResetEmail(auth, m); } catch (e2) { if (String(e2.code).includes("network") || String(e2.code).includes("too-many")) return err(msgFor(e2)); }
      ok("Se esse e-mail tiver cadastro, enviamos um link para criar uma senha nova. Olhe também a caixa de spam.");
    };
    const enter = gate.querySelector("#g-enter");
    enter.onclick = async () => {
      const m = gate.querySelector("#g-mail").value.trim(), p = gate.querySelector("#g-pass").value;
      if (!/^\S+@\S+\.\S+$/.test(m)) return err("Digite seu e-mail.");
      if (!p) return err("Digite a senha.");
      busy(true);
      try { await A.signInWithEmailAndPassword(auth, m, p); } catch (e) { busy(false); err(msgFor(e)); }
    };
    onEnter(enter);
  };

  const signupView = () => {
    show(`<p class="g-sub">Peça seu acesso. Ele é liberado depois da aprovação.</p>
      ${inAppNote()}
      <button class="g-google" id="g-google">${gIcon}Continuar com Google</button>
      <div class="g-or"><span>ou cadastre-se</span></div>
      <input id="g-name" placeholder="Seu nome" autocomplete="name" maxlength="60">
      <input id="g-mail" type="email" inputmode="email" placeholder="E-mail" autocomplete="email" autocapitalize="off">
      <input id="g-wpp" type="tel" inputmode="tel" placeholder="WhatsApp com DDD" autocomplete="tel" maxlength="20">
      <input id="g-pass" type="password" placeholder="Crie uma senha (mín. 6)" autocomplete="new-password">
      <label class="g-check"><input type="checkbox" id="g-18"><span>Tenho 18 anos ou mais, sei que palpite não é garantia de resultado e aceito os <a href="termos/" target="_blank" rel="noopener" style="color:var(--green);font-weight:700">termos de uso e privacidade</a>.</span></label>
      <div class="g-err" hidden></div>
      <button class="g-main" id="g-sign">Pedir acesso</button>
      <p class="g-link">Já tem conta? <a href="#" id="g-tologin">Entrar</a></p>`);
    wireCommon();
    gate.querySelector("#g-tologin").onclick = e => { e.preventDefault(); loginView(); };
    const sign = gate.querySelector("#g-sign");
    sign.onclick = async () => {
      const n = gate.querySelector("#g-name").value.trim(), m = gate.querySelector("#g-mail").value.trim(), w = digits(gate.querySelector("#g-wpp").value), p = gate.querySelector("#g-pass").value;
      if (n.length < 2) return err("Digite seu nome.");
      if (!/^\S+@\S+\.\S+$/.test(m)) return err("Digite um e-mail válido.");
      if (w.length < 10 || w.length > 13) return err("Digite o WhatsApp com DDD.");
      if (p.length < 6) return err("A senha precisa ter pelo menos 6 caracteres.");
      if (!gate.querySelector("#g-18").checked) return err("Confirme que você tem 18 anos ou mais.");
      busy(true);
      try {
        sessionStorage.setItem("pl-new", JSON.stringify({name: n, whatsapp: w, adult: true}));
        const c = await A.createUserWithEmailAndPassword(auth, m, p);
        await A.updateProfile(c.user, {displayName: n}).catch(() => {});
      } catch (e) {
        busy(false);
        if (String(e && e.code).includes("email-already-in-use")) { loginView(m); err("Esse e-mail já tem cadastro. Digite a senha para entrar."); }
        else err(msgFor(e));
      }
    };
    onEnter(sign);
  };

  async function google() {
    if (inApp) return err("O Google não deixa entrar por dentro do Instagram/TikTok. Abra no navegador (aviso acima) ou use e-mail e senha.");
    busy(true);
    const prov = new A.GoogleAuthProvider();
    prov.setCustomParameters({prompt: "select_account"});
    try { await A.signInWithPopup(auth, prov); }
    catch (e) {
      if (String(e.code).includes("popup-blocked") || String(e.code).includes("operation-not-supported")) {
        try { await A.signInWithRedirect(auth, prov); return; } catch (e2) { e = e2; }
      }
      console.error("Palpiteiro google login", e && e.code, e && e.message);
      busy(false); err(String(e && e.code).includes("invalid-credential") ? "O Google recusou o login. (" + e.code + ")" : msgFor(e));
    }
  }

  const waitView = (u, d) => {
    show(`<h2>Pedido enviado</h2>
      <p class="g-sub">Olá, ${esc(d.name || "tudo bem")}! Seu acesso está aguardando aprovação. Assim que for liberado, o app abre aqui automaticamente.</p>
      ${d.whatsapp ? "" : `<p class="g-sub" style="margin-top:6px">Deixe seu WhatsApp para falarmos com você:</p>
      <input id="g-wpp" type="tel" inputmode="tel" placeholder="WhatsApp com DDD" autocomplete="tel" maxlength="20">
      <div class="g-err" hidden></div>
      <button class="g-main" id="g-savewpp">Salvar WhatsApp</button>`}
      <div id="g-previa"></div>
      ${installLink() ? `<p class="g-sub">Enquanto espera, já deixe o app instalado:</p>${installLink()}` : ""}
      <button class="g-ghost" id="g-out">Sair</button>`);
    // mostra os jogos do dia enquanto o acesso não sai
    if (window.palPrevia) window.palPrevia(gate.querySelector("#g-previa"));
    wireCommon();
    gate.querySelector("#g-out").onclick = () => A.signOut(auth);
    const sv = gate.querySelector("#g-savewpp");
    if (sv) {
      sv.onclick = async () => {
        const w = digits(gate.querySelector("#g-wpp").value);
        if (w.length < 10 || w.length > 13) return err("Digite o WhatsApp com DDD.");
        busy(true);
        try { await F.updateDoc(F.doc(db, "users", u.uid), {whatsapp: w}); } catch (e) { busy(false); err("Não deu para salvar agora."); }
      };
      onEnter(sv);
    }
  };
  const blockedView = () => {
    show(`<h2>Acesso não liberado</h2><p class="g-sub">Seu pedido não foi aprovado. Fale com o suporte se achar que foi um engano.</p>
      <button class="g-ghost" id="g-out">Sair</button>`);
    gate.querySelector("#g-out").onclick = () => A.signOut(auth);
  };
  const loading = () => show(`<div class="g-load"><span class="dots"><i></i><i></i><i></i></span></div>`);

  const TZBR = "America/Sao_Paulo";
  const today = () => new Date().toLocaleDateString("en-CA", {timeZone: TZBR});
  const ontem = () => new Date(Date.now() - 86400000).toLocaleDateString("en-CA", {timeZone: TZBR});

  // Bilhetes prontos do dia, cadastrados no painel do administrador.
  const watchTickets = () => {
    if (unsubTickets) unsubTickets();
    const day = today();
    unsubTickets = F.onSnapshot(F.query(F.collection(db, "tickets"), F.where("date", "==", day)), s => {
      window.palTickets = s.docs.map(d => ({id: d.id, ...d.data()}))
        .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.tipo).localeCompare(String(b.tipo)));
      window.palRender && window.palRender();
    }, e => console.warn("Palpiteiro: não deu para ler os bilhetes", e && e.code));
    watchTickets.day = day;
  };

  // Desfalques cadastrados no painel.
  const watchOut = () => {
    if (unsubOut) unsubOut();
    unsubOut = F.onSnapshot(F.collection(db, "desfalques"), s => {
      window.palOut = s.docs.map(d => ({id: d.id, ...d.data()}));
      window.palRender && window.palRender();
    }, e => console.warn("Palpiteiro: desfalques", e && e.code));
  };

  // Casas de apostas que aparecem nos botões do app.
  const watchCasas = () => {
    if (unsubCasas) unsubCasas();
    unsubCasas = F.onSnapshot(F.collection(db, "casas"), s => {
      window.palCasas = s.docs.map(d => ({id: d.id, ...d.data()}))
        .filter(c => c.ativa !== false && c.link)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      window.palRender && window.palRender();
    }, e => console.warn("Palpiteiro: casas", e && e.code));
  };

  const closeApp = () => {
    window.track = () => {};
    window.palUser = null;
    window.palTickets = null;
    if (unsubTickets) { unsubTickets(); unsubTickets = null; }
    if (unsubOut) { unsubOut(); unsubOut = null; }
    if (unsubCasas) { unsubCasas(); unsubCasas = null; }
    if (unsubBan) { unsubBan(); unsubBan = null; }
    window.palBanner = null;
    if (beat) { clearInterval(beat); beat = null; }
    window.palCasas = null; window.palCalibra = null;
    window.palSave = null; window.palBolao = null; window.palOut = null; window.palStreak = 0;
    window.palIsAdmin = false; window.palSalvarBilhetes = null; window.palClick = null;
    document.body.classList.add("locked");
    gate.hidden = false;
  };

  const openApp = (u, d) => {
    document.body.classList.remove("locked");
    gate.hidden = true;
    window.palUser = {
      email: u.email || d.email || "", name: d.name || u.displayName || "",
      foto: d.photo || u.photoURL || "", whatsapp: d.whatsapp || "",
      provider: d.provider || ((u.providerData || []).some(x => x.providerId === "google.com") ? "google" : "email"),
      criadoEm: (d.createdAt && d.createdAt.toMillis) ? d.createdAt.toMillis() : 0,
      status: d.status || ""
    };
    window.palSignOut = () => { if (confirm("Sair da sua conta?")) A.signOut(auth); };
    const ref = F.doc(db, "users", u.uid);
    // Guarda favoritos e bilhete na conta, não só no celular.
    window.palSave = patch => F.updateDoc(ref, patch).catch(e => console.warn("Palpiteiro: não salvou", e && e.code));
    // Sequência de dias abrindo o app.
    const hoje = today();
    let seq = +d.streak || 0;
    if (d.lastDay === hoje) { if (!seq) seq = 1; }
    else { seq = d.lastDay === ontem() ? seq + 1 : 1; F.updateDoc(ref, {streak: seq, lastDay: hoje}).catch(() => {}); }
    window.palStreak = seq;
    // Bolão: cada palpite de placar é um documento, com a hora do jogo gravada.
    const limpaId = id => String(id).replace(/[^A-Za-z0-9_-]/g, "");
    const docId = id => `${u.uid}__${limpaId(id)}`;
    window.palBolao = {
      meus: async (dia) => {
        const q = F.query(F.collection(db, "bolao"), F.where("uid", "==", u.uid), F.where("dia", "==", dia));
        const s = await F.getDocs(q);
        const out = {};
        s.docs.forEach(x => { const v = x.data(); out[v.matchId] = {h: v.h, a: v.a, pts: v.pts || 0, pontuado: v.pontuado === true}; });
        return out;
      },
      salvar: async (matchId, kickISO, h, a) => {
        const r = F.doc(db, "bolao", docId(matchId));
        const dia = new Date(kickISO).toLocaleDateString("en-CA", {timeZone: TZBR});
        const snap = await F.getDoc(r);
        if (snap.exists()) return F.updateDoc(r, {h, a, updatedAt: F.serverTimestamp()});
        return F.setDoc(r, {uid: u.uid, nome: (d.name || u.displayName || u.email || "").slice(0, 40),
          matchId: limpaId(matchId), dia, mes: dia.slice(0, 7), kick: new Date(kickISO), h, a,
          pts: 0, pontuado: false, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp()});
      },
      pontuar: (matchId, pts) => F.updateDoc(F.doc(db, "bolao", docId(matchId)),
        {pts, pontuado: true, updatedAt: F.serverTimestamp()}).catch(() => {}),
      ranking: async () => {
        const mes = hoje.slice(0, 7);
        const s = await F.getDocs(F.query(F.collection(db, "bolao"), F.where("mes", "==", mes)));
        const por = new Map();
        s.docs.forEach(x => {
          const v = x.data(), k = v.uid;
          const o = por.get(k) || {uid: k, nome: v.nome || "Sem nome", pts: 0, jogos: 0, exatos: 0};
          o.pts += (+v.pts || 0); o.jogos++; if ((+v.pts || 0) >= 5) o.exatos++;
          if (v.nome) o.nome = v.nome;
          por.set(k, o);
        });
        return [...por.values()].sort((x, y) => y.pts - x.pts || y.exatos - x.exatos).map((x, i) => ({...x, pos: i + 1, eu: x.uid === u.uid}));
      }
    };
    const bump = (field) => {
      const inc = F.increment(1), now = F.serverTimestamp();
      F.updateDoc(ref, {[field]: inc, lastSeen: now}).catch(() => {});
      F.setDoc(F.doc(db, "users", u.uid, "days", today()), {[field]: inc, date: today(), last: now}, {merge: true}).catch(() => {});
    };
    window.track = kind => { if (["games", "bets", "tickets"].includes(kind)) bump(kind); };
    window.palClick = id => { if (id) F.updateDoc(F.doc(db, "tickets", String(id)), {clicks: F.increment(1)}).catch(() => {}); };
    // Só o administrador pode montar os bilhetes do dia direto pelo app.
    window.palIsAdmin = souAdmin(u);
    window.palSalvarBilhetes = async (lista) => {
      for (const t of lista) {
        await F.addDoc(F.collection(db, "tickets"), {...t, clicks: 0,
          createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), by: u.email || ""});
      }
    };
    let opened = false; try { opened = !!sessionStorage.getItem("pl-open"); } catch (e) {}
    if (!opened) { try { sessionStorage.setItem("pl-open", "1"); } catch (e) {} bump("opens"); }
    else F.updateDoc(ref, {lastSeen: F.serverTimestamp()}).catch(() => {});
    // marca presença de tempos em tempos (o painel usa para o "online agora") e troca os bilhetes na virada do dia
    if (beat) clearInterval(beat);
    beat = setInterval(() => {
      if (document.hidden) return;
      F.updateDoc(ref, {lastSeen: F.serverTimestamp()}).catch(() => {});
      if (watchTickets.day !== today()) watchTickets();
    }, 5 * 60000);
    watchTickets();
    watchOut();
    watchCasas();
    // recado que o admin escreve no painel
    if (unsubBan) unsubBan();
    unsubBan = F.onSnapshot(F.doc(db, "config", "banner"), s => {
      const d = s.data() || {};
      window.palBanner = d.ativo && d.texto ? d : null;
      window.palRender && window.palRender();
    }, () => {});
    // Medição de acertos: grava os palpites antes do apito e o resultado depois.
    const calId = id => String(id).replace(/[^A-Za-z0-9_-]/g, "");
    window.palCalibra = {
      registrar: (id, dados) => F.setDoc(F.doc(db, "calibra", calId(id)), {
        matchId: calId(id), jogo: String(dados.jogo || "").slice(0, 60), dia: dados.dia, mes: String(dados.dia).slice(0, 7),
        liga: String(dados.liga || "").slice(0, 40), slug: String(dados.slug || "").slice(0, 60), kick: new Date(dados.kick),
        picks: (dados.picks || []).slice(0, 5).map(x => ({mk: String(x.mk).slice(0, 40), conf: +x.conf || 0})),
        placar: null, acertos: [], avaliado: false, criadoEm: F.serverTimestamp()
      }).catch(() => {}),
      pendentes: async (desde) => {
        const q = F.query(F.collection(db, "calibra"), F.where("avaliado", "==", false), F.where("dia", ">=", desde));
        const s = await F.getDocs(q).catch(() => null);
        return s ? s.docs.map(d => ({id: d.id, ...d.data()})) : [];
      },
      resolver: (id, placar, acertos) => F.updateDoc(F.doc(db, "calibra", calId(id)),
        {placar, acertos, avaliado: true, updatedAt: F.serverTimestamp()}).catch(() => {})
    };
    window.palLoadCloud && window.palLoadCloud(d);
    window.dispatchEvent(new Event("resize"));
  };

  const makeDoc = (u) => {
    let extra = {};
    try { extra = JSON.parse(sessionStorage.getItem("pl-new") || "{}"); } catch (e) {}
    const isGoogle = (u.providerData || []).some(p => p.providerId === "google.com");
    return F.setDoc(F.doc(db, "users", u.uid), {
      name: String(extra.name || u.displayName || "").slice(0, 60),
      whatsapp: extra.whatsapp || "",
      email: u.email || "",
      photo: u.photoURL || "",
      provider: isGoogle ? "google" : "email",
      status: "pending",
      adult: extra.adult === true,
      createdAt: F.serverTimestamp(),
      lastSeen: F.serverTimestamp(),
      opens: 0, games: 0, bets: 0, tickets: 0
    }).then(() => { try { sessionStorage.removeItem("pl-new"); } catch (e) {} });
  };

  // Mantém a lista de administradores atualizada (documento config/admins).
  const ouvirAdmins = () => {
    if (unsubAdm) return;
    unsubAdm = F.onSnapshot(F.doc(db, "config", "admins"), s => {
      const d = s.data() || {};
      adminsExtra = (Array.isArray(d.emails) ? d.emails : []).map(e => String(e).toLowerCase());
      const u = auth.currentUser;
      if (u && !document.body.classList.contains("locked")) {
        window.palIsAdmin = souAdmin(u);
        window.palRender && window.palRender();
      }
    }, () => {});
  };

  loading();
  A.getRedirectResult(auth).catch(e => console.warn("Palpiteiro redirect", e && e.code));
  A.onAuthStateChanged(auth, async u => {
    if (unsub) { unsub(); unsub = null; }
    if (!u) { closeApp(); return loginView(); }
    document.body.classList.add("locked"); gate.hidden = false;
    loading();
    const ref = F.doc(db, "users", u.uid);
    ouvirAdmins();
    const isAdmin = souAdmin(u);
    try {
      const snap = await F.getDoc(ref);
      if (!snap.exists()) await makeDoc(u);
    } catch (e) { console.error("Palpiteiro cadastro", e); }
    let opened = false, lastKey = "", retried = false, promoted = false;
    unsub = F.onSnapshot(ref, s => {
      // cadastro não chegou a ser gravado (queda de internet na hora): tenta de novo
      if (!s.exists() && !retried) { retried = true; makeDoc(u).catch(e => console.error("Palpiteiro cadastro", e)); }
      const d = s.data() || {};
      // administrador não precisa esperar aprovação
      if (isAdmin && s.exists() && d.status !== "approved" && !promoted) {
        promoted = true;
        F.updateDoc(ref, {status: "approved"}).catch(() => {});
      }
      if (d.status === "approved") { lastKey = "ok"; if (!opened) { opened = true; openApp(u, d); } return; }
      if (opened) { opened = false; closeApp(); }
      // só redesenha quando muda algo importante (não apaga o que a pessoa está digitando)
      const key = (d.status || "pending") + "|" + (d.whatsapp ? 1 : 0) + "|" + (d.name || "");
      if (key === lastKey) return;
      lastKey = key;
      d.status === "blocked" ? blockedView() : waitView(u, d);
    }, e => {
      console.error("Palpiteiro acesso", e && e.code);
      show(`<h2>Sem conexão com o servidor</h2><p class="g-sub">Não deu para conferir seu acesso agora. Confira a internet e tente de novo.</p>
        <button class="g-main" id="g-retry">Tentar de novo</button><button class="g-ghost" id="g-out">Sair</button>`);
      gate.querySelector("#g-retry").onclick = () => location.reload();
      gate.querySelector("#g-out").onclick = () => A.signOut(auth);
    });
  });
}
