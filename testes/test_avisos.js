const B = require("./base.js");
const {chromium, srv, ctx, ok, errors, fs, ROOT} = B;
const path = require("path");
const PORT = 8785, URL = `http://localhost:${PORT}/ia/`;
const hoje = "2026-11-18";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  // finge um celular que sabe receber aviso
  const celular = (perm = "default") => `
    window.__perm = ${JSON.stringify(perm)};
    window.Notification = function () {};
    Object.defineProperty(window.Notification, "permission", {get: () => window.__perm});
    window.Notification.requestPermission = async () => { window.__pediu = true; window.__perm = window.__resposta || "granted"; return window.__perm; };
    window.PushManager = function () {};
    navigator.serviceWorker.register = async () => ({scope: "/", pushManager: {}});`;
  const conta = (extra = "{}", push = "") => `
    ${push}
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":Object.assign({status:"approved",name:"Ana",opens:4},${extra}),
      "tickets/t1":{date:"${hoje}",tipo:"Seguro",odd:"2.00",order:0,sel:[{jogo:"Flamengo x Vasco da Gama",mercado:"Vitória do Flamengo"},{jogo:"Arsenal x Chelsea",mercado:"Mais de 2.5 gols"}]}};
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`;
  const palpites = async p => {
    await p.goto(URL); await p.waitForSelector(".league");
    await p.locator(".seg button", {hasText: "Palpites"}).click();
    await p.waitForSelector(".ready, .dia, .empty", {timeout: 8000});
  };

  /* ---------- a chave pública está no app ---------- */
  const cfg = fs.readFileSync(path.join(ROOT, "ia/firebase-config.js"), "utf8");
  const vap = (/VAPID = "([^"]+)"/.exec(cfg) || [])[1] || "";
  ok(vap.startsWith("B") && vap.length > 80, "a chave pública dos avisos está guardada no app");
  const swm = fs.readFileSync(path.join(ROOT, "ia/firebase-messaging-sw.js"), "utf8");
  ok(/onBackgroundMessage/.test(swm) && /notificationclick/.test(swm),
    "o arquivo de avisos sabe mostrar o aviso e abrir o app ao tocar");
  ok(/palpiteiro-7b202/.test(swm), "o arquivo de avisos aponta para o projeto certo");

  /* ---------- o convite aparece, mas não pede permissão sozinho ---------- */
  let p = await ctx(browser, {}, conta("{}", celular()));
  await palpites(p);
  await p.waitForSelector(".push", {timeout: 8000});
  const t = await p.innerText(".push");
  ok(/Te aviso quando sair o bilhete/.test(t), "convite explica antes de pedir");
  ok(/desligar/i.test(t), "o convite diz que dá para desligar depois");
  ok(!(await p.evaluate(() => window.__pediu)), "não pede a permissão do celular sem a pessoa tocar");
  await p.screenshot({path: "shots/a1-convite.png", fullPage: true});

  /* ---------- "agora não" some e não volta ---------- */
  await p.locator(".push-n").click();
  await p.waitForTimeout(400);
  ok(await p.locator(".push").count() === 0, "o convite some ao tocar em Agora não");
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForTimeout(600);
  ok(await p.locator(".push").count() === 0, "e não volta na próxima abertura");
  await p.context().close();

  /* ---------- "quero" pede a permissão e guarda o aparelho ---------- */
  p = await ctx(browser, {}, conta("{}", celular()));
  await palpites(p);
  await p.waitForSelector(".push", {timeout: 8000});
  await p.locator(".push .gen").click();
  await p.waitForFunction(() => window.__db["users/u1"].push && window.__db["users/u1"].push.token, null, {timeout: 10000});
  const u = await p.evaluate(() => window.__db["users/u1"]);
  ok(await p.evaluate(() => window.__pediu), "só então pede a permissão do celular");
  ok(u.avisos && u.avisos.on === true, "marca que a pessoa quer receber");
  ok(u.push.token === "tok-de-teste", "guarda o endereço do aparelho");
  const usada = await p.evaluate(() => window.__vapid);
  ok(usada === vap, "usa a mesma chave pública que está no app");
  ok(await p.locator(".push").count() === 0, "o convite some depois de aceitar");

  /* ---------- aviso chegando com o app aberto ---------- */
  await p.evaluate(() => window.__onMessage({data: {titulo: "Saiu o bilhete de hoje", texto: "2 bilhetes prontos.", url: "/"}}));
  await p.waitForSelector(".aviso-in.on", {timeout: 5000});
  const av = await p.innerText(".aviso-in");
  ok(/Saiu o bilhete de hoje/.test(av) && /2 bilhetes/.test(av), "com o app aberto o aviso aparece como cartão: " + av.replace(/\n/g, " "));
  await p.screenshot({path: "shots/a2-aviso.png"});

  /* ---------- desligar pelo perfil ---------- */
  await p.evaluate(() => go("perfil"));
  await p.waitForSelector(".pf-top", {timeout: 8000});
  const bt = p.locator(".pf-bt", {hasText: "Desligar os avisos"});
  ok(await bt.count() === 1, "o perfil mostra como desligar");
  await bt.click();
  await p.waitForFunction(() => window.__db["users/u1"].avisos.on === false, null, {timeout: 8000});
  ok(true, "desliga os avisos sem precisar mexer no celular");
  await p.context().close();

  /* ---------- celular que bloqueou ---------- */
  p = await ctx(browser, {}, conta("{}", celular("denied")));
  await palpites(p);
  await p.waitForTimeout(600);
  ok(await p.locator(".push").count() === 0, "celular que já bloqueou não vê o convite");
  await p.evaluate(() => go("perfil"));
  await p.waitForSelector(".pf-top", {timeout: 8000});
  ok(/bloqueados para este site/.test(await p.innerText("#app")), "o perfil explica que o celular bloqueou");
  await p.context().close();

  /* ---------- celular que não sabe receber ---------- */
  p = await ctx(browser, {}, conta("{}", `delete window.Notification; delete window.PushManager;`));
  await palpites(p);
  await p.waitForTimeout(600);
  ok(await p.locator(".push").count() === 0, "celular sem suporte não vê convite nenhum");
  ok(!(await p.evaluate(() => !!(window.palPush && window.palPush.pode()))), "o app sabe que esse aparelho não recebe aviso");
  await p.context().close();

  /* ---------- a rotina do servidor ---------- */
  const rot = fs.readFileSync(path.join(ROOT, "rotina/diaria.js"), "utf8");
  ok(!/AIza|BEGIN PRIVATE KEY|apikey\s*=\s*["'][A-Za-z0-9]/.test(rot), "a rotina não tem nenhuma senha escrita dentro");
  ok(/process\.env\.FIREBASE_SERVICE_ACCOUNT/.test(rot) && /process\.env\.CALLMEBOT_APIKEY/.test(rot),
    "a rotina lê os segredos do GitHub, não do código");
  ok(/avisos\.on", "==", true/.test(rot), "a rotina só manda aviso para quem ligou");
  ok(/registration-token-not-registered/.test(rot), "a rotina limpa aparelho que desinstalou o app");
  const fluxo = fs.readFileSync(path.join(ROOT, ".github/workflows/rotina.yml"), "utf8");
  ok(/secrets\.FIREBASE_SERVICE_ACCOUNT/.test(fluxo) && /workflow_dispatch/.test(fluxo),
    "o fluxo do GitHub passa os segredos e dá para rodar na mão");

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
