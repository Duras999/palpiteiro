/* Rotina do Palpiteiro, rodada pelo GitHub de hora em hora.
   Faz três coisas e nada além disso:
     1. confere se o site está de pé;
     2. avisa no celular quando sai bilhete novo;
     3. avisa no celular quando o resultado do dia fecha.
   Se o site cair, manda recado no WhatsApp.

   Segredos que ela usa (nenhum fica no código):
     FIREBASE_SERVICE_ACCOUNT  conta de serviço do Firebase, o JSON inteiro
     CALLMEBOT_APIKEY          chave do CallMeBot, para o WhatsApp (opcional)
     CALLMEBOT_FONE            telefone com DDI, ex.: 5511941767733 (opcional) */

const SITE = "https://opalpiteiro.online";
const PAGINAS = [
  {url: SITE + "/", precisa: ["Palpiteiro", "gate.js"]},
  {url: SITE + "/retrospecto/", precisa: ["Retrospecto"]},
  {url: SITE + "/termos/", precisa: ["Termos"]}
];

const hojeBR = () => new Date().toLocaleDateString("en-CA", {timeZone: "America/Sao_Paulo"});
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- 1. o site está de pé? ---------- */
async function conferirSite() {
  const problemas = [];
  for (const p of PAGINAS) {
    try {
      const r = await fetch(p.url + "?ping=" + Date.now(), {redirect: "follow"});
      if (!r.ok) { problemas.push(`${p.url} respondeu ${r.status}`); continue; }
      const t = await r.text();
      const faltando = p.precisa.filter(x => !t.includes(x));
      if (faltando.length) problemas.push(`${p.url} carregou mas sem: ${faltando.join(", ")}`);
    } catch (e) {
      problemas.push(`${p.url} não respondeu (${e.message})`);
    }
  }
  return problemas;
}

/* ---------- recado no WhatsApp ---------- */
async function whatsapp(texto) {
  const key = process.env.CALLMEBOT_APIKEY, fone = process.env.CALLMEBOT_FONE;
  if (!key || !fone) { log("sem chave do WhatsApp, só registro aqui:", texto); return false; }
  const u = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(fone)}` +
            `&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(key)}`;
  const r = await fetch(u).catch(e => ({ok: false, status: e.message}));
  log("WhatsApp:", r.ok ? "enviado" : "falhou " + r.status);
  return !!r.ok;
}

/* ---------- Firebase ---------- */
async function abrirFirebase() {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) { log("sem conta de serviço: só o teste do site roda"); return null; }
  const admin = await import("firebase-admin/app");
  const {getFirestore} = await import("firebase-admin/firestore");
  const {getMessaging} = await import("firebase-admin/messaging");
  const cred = JSON.parse(bruto);
  const app = admin.initializeApp({credential: admin.cert(cred)});
  return {db: getFirestore(app), msg: getMessaging(app)};
}

/* ---------- manda o aviso para todo mundo que deixou ligado ---------- */
async function avisar(F, {titulo, texto, url, tag}) {
  const users = await F.db.collection("users").where("avisos.on", "==", true).get();
  const tokens = users.docs.map(d => (d.data().push || {}).token).filter(Boolean);
  const unicos = [...new Set(tokens)];
  if (!unicos.length) { log("ninguém com avisos ligados ainda"); return 0; }
  let enviados = 0;
  for (let i = 0; i < unicos.length; i += 450) {
    const lote = unicos.slice(i, i + 450);
    const r = await F.msg.sendEachForMulticast({
      tokens: lote,
      data: {titulo, texto, url: url || "/", tag: tag || "palpiteiro"},
      webpush: {headers: {Urgency: "normal", TTL: "7200"}}
    });
    enviados += r.successCount;
    // endereço que não existe mais: limpa, senão fica tentando para sempre
    r.responses.forEach((res, k) => {
      const cod = res.error && res.error.code;
      if (cod === "messaging/registration-token-not-registered" || cod === "messaging/invalid-argument") {
        const alvo = lote[k];
        users.docs.filter(d => (d.data().push || {}).token === alvo)
          .forEach(d => d.ref.update({push: {}, avisos: {on: false, quando: Date.now()}}).catch(() => {}));
      }
    });
  }
  log(`aviso "${titulo}" enviado para ${enviados} de ${unicos.length}`);
  return enviados;
}

/* ---------- 2 e 3: o que há para avisar hoje ---------- */
async function avisosDoDia(F) {
  const dia = hojeBR();
  const ref = F.db.collection("config").doc("avisados");
  const feito = (await ref.get()).data() || {};

  // bilhete novo
  if (feito.bilhete !== dia) {
    const t = await F.db.collection("tickets").where("date", "==", dia).get();
    const agora = Date.now();
    const noAr = t.docs.map(d => d.data()).filter(b => {
      if (!b || !Array.isArray(b.sel) || !b.sel.length) return false;
      if (!b.publicarAs) return true;
      const q = b.publicarAs.toMillis ? b.publicarAs.toMillis() : +new Date(b.publicarAs);
      return q <= agora;
    });
    if (noAr.length) {
      const n = noAr.length;
      await avisar(F, {
        titulo: "Saiu o bilhete de hoje",
        texto: n === 1 ? "Um bilhete pronto esperando por você." : `${n} bilhetes prontos esperando por você.`,
        url: "/", tag: "bilhete-" + dia
      });
      await ref.set({bilhete: dia}, {merge: true});
    }
  }

  // resultado do dia anterior
  const pub = (await F.db.collection("config").doc("publico").get()).data();
  if (pub && pub.dias && pub.dias.length) {
    const ult = pub.dias[pub.dias.length - 1];
    if (ult && ult.d && feito.resultado !== ult.d && ult.d !== dia) {
      const g = +ult.g || 0, r = +ult.r || 0;
      if (g + r > 0) {
        await avisar(F, {
          titulo: g > r ? "Fechamos no verde" : g === r ? "Dia dividido" : "Dia difícil",
          texto: `${ult.d.split("-").reverse().slice(0, 2).join("/")}: ${g} green e ${r} red. Veja o retrospecto.`,
          url: "/#retro", tag: "resultado-" + ult.d
        });
        await ref.set({resultado: ult.d}, {merge: true});
      }
    }
  }
}

/* ---------- juntando tudo ---------- */
(async () => {
  const problemas = await conferirSite();
  if (problemas.length) {
    log("SITE COM PROBLEMA:\n" + problemas.join("\n"));
    await whatsapp("Palpiteiro fora do ar:\n" + problemas.join("\n"));
    process.exit(1);
  }
  log("site de pé, todas as páginas carregaram");

  const F = await abrirFirebase();
  if (!F) return;
  try {
    await avisosDoDia(F);
  } catch (e) {
    log("erro nos avisos:", e.message);
    await whatsapp("Palpiteiro: a rotina dos avisos falhou — " + e.message);
    process.exit(1);
  }
  log("rotina terminada");
})();
