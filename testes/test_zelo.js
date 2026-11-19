const B = require("./base.js");
const {chromium, srv, ctx, ok, errors, fs, ROOT} = B;
const path = require("path");
const PORT = 8781, URL = `http://localhost:${PORT}/ia/`;
const hoje = "2026-11-18";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const conta = (extra = "{}", banner = null) => `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana Souza",providerData:[]};
    window.__db={"users/u1":Object.assign({status:"approved",name:"Ana Souza",opens:1},${extra})
      ${banner ? `,"config/banner":${JSON.stringify(banner)}` : ""}};
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`;

  /* ---------- 68: preview de link ---------- */
  const html = fs.readFileSync(path.join(ROOT, "ia/index.html"), "utf8");
  const tag = re => (re.exec(html) || [])[1] || "";
  ok(tag(/property="og:title" content="([^"]+)"/).includes("Palpiteiro"), "título do preview preenchido");
  ok(tag(/property="og:image" content="([^"]+)"/) === "https://opalpiteiro.online/preview.png?v=1", "imagem do preview com endereço completo");
  ok(tag(/property="og:url" content="([^"]+)"/) === "https://opalpiteiro.online/", "endereço do preview aponta para o site");
  ok(tag(/name="twitter:card" content="([^"]+)"/) === "summary_large_image", "preview grande no X e no Telegram");
  const img = fs.statSync(path.join(ROOT, "ia/preview.png"));
  ok(img.size > 10000 && img.size < 600000, "imagem do preview existe e é leve (" + Math.round(img.size / 1024) + " KB)");

  /* ---------- 64: +18 no portão ---------- */
  let p = await ctx(browser, {}, `window.__user=null;window.__db={};`);
  await p.goto(URL); await p.waitForSelector("#gate .g-card");
  const g = await p.innerText("#gate");
  ok(/\+18/.test(g) && /respons/i.test(g), "quem nem entrou já vê o aviso +18 no portão");
  ok(await p.locator('#gate a[href="termos/#responsabilidade"]').count() > 0, "o portão leva ao trecho de jogo responsável");
  await p.context().close();

  /* ---------- 64: +18 na primeira abertura ---------- */
  p = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana Souza",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana Souza",opens:1}};
    try{localStorage.setItem("pal-favs","[]");localStorage.removeItem("pal-bemvindo");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.waitForSelector(".bemvindo .bv", {timeout: 8000});
  ok(/18 anos/.test(await p.innerText(".bemvindo .bv")), "boas-vindas avisa que é +18 e que não é garantia");
  await p.click("#bv-ok");

  /* ---------- 66: a % é confiança, não promessa ---------- */
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick, .empty");
  const av = await p.innerText(".aviso-conf");
  ok(/confiança do nosso cálculo/.test(av) && /não é a chance real/.test(av), "explica o que a porcentagem é e o que não é");

  /* ---------- 79: a leitura é contada e vai junto da presença ---------- */
  await p.waitForTimeout(600);
  const l = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("pal-leituras") || "null"); } catch (e) { return null; } });
  ok(l && l.dia === "${DIA}".replace("${DIA}", l.dia) && l.n > 0, "o app conta os documentos que leu (" + (l && l.n) + ")");
  const u = await p.evaluate(() => window.__db["users/u1"]);
  ok(u.leituras && u.leituras.dia === l.dia && u.leituras.n > 0, "a contagem sobe junto do sinal de presença, sem gravação extra");
  await p.context().close();

  /* ---------- 66: aviso no bilhete pronto ---------- */
  const bilhetes = {
    [`tickets/t1`]: {date: hoje, tipo: "Seguro", odd: "2.10", order: 0,
      sel: [{jogo: "Flamengo x Vasco", mercado: "Vitória do Flamengo"}, {jogo: "Arsenal x Chelsea", mercado: "Mais de 2.5 gols"}]},
    [`tickets/t2`]: {date: hoje, tipo: "Médio", odd: "3.40", order: 1,
      sel: [{jogo: "Gremio x Internacional", mercado: "Ambas marcam: Sim"}]}};
  p = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana Souza",providerData:[]};
    window.__db=Object.assign({"users/u1":{status:"approved",name:"Ana Souza",opens:1}},${JSON.stringify(bilhetes)});
    try{localStorage.setItem("pal-favs","[]");localStorage.setItem("pal-bemvindo","1");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".tab, .seg button", {hasText: "Palpites"}).first().click();
  await p.waitForSelector(".ready-note", {timeout: 8000});
  ok(/pode vir red/.test(await p.innerText(".ready-note")), "bilhete pronto avisa que pode vir red");
  await p.context().close();

  /* ---------- 80: modo manutenção ---------- */
  p = await ctx(browser, {}, conta("{}", {ativo: false, texto: "", manutencao: true, manutTexto: "Voltamos às 18h."}));
  await p.goto(URL); await p.waitForSelector("#gate .g-card", {timeout: 10000});
  await p.waitForTimeout(400);
  const t = await p.innerText("#gate");
  ok(/Já voltamos/.test(t) && /Voltamos às 18h/.test(t), "usuário comum vê o aviso de manutenção com o recado do painel");
  ok(await p.evaluate(() => document.body.classList.contains("locked")), "o app fica travado atrás do aviso");
  // desligou a manutenção: o app volta sozinho, sem recarregar
  await p.evaluate(() => { window.__db["config/banner"] = {ativo: false, texto: "", manutencao: false}; window.__notify(); });
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById("gate").hidden && !document.body.classList.contains("locked")),
    "ao desligar a manutenção o app volta sozinho");
  await p.context().close();

  /* ---------- 80: o administrador continua vendo o app ---------- */
  const ADM = B.ADM;
  p = await ctx(browser, {}, `
    window.__user={uid:"a1",email:${JSON.stringify(ADM)},displayName:"Jorge",providerData:[]};
    window.__db={"users/a1":{status:"approved",name:"Jorge",opens:1},
      "config/banner":{ativo:false,texto:"",manutencao:true,manutTexto:"Voltamos já."}};`);
  await p.goto(URL); await p.waitForSelector(".league", {timeout: 10000});
  await p.waitForTimeout(500);
  ok(!/Já voltamos/.test(await p.innerText("body")), "administrador continua enxergando o app durante a manutenção");
  await p.context().close();

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
