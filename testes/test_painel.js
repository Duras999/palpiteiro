const B = require("./base.js");
const {chromium, srv, ctx, ok, errors, iso} = B;
const PORT = 8776, URL = `http://localhost:${PORT}/ia/`, HOJE = "2026-11-18";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const T = (id, extra = "") => `"tickets/${id}":{date:"${HOJE}",tipo:"Seguro",odd:"3.20",codigo:"ABC123",clicks:0,order:1,
    sel:[{id:"gre-int",jogo:"Grêmio x Inter",hora:"19:00",mercado:"Ambas marcam: Sim"},{id:"sumiu",jogo:"Fantasma x Sumido",hora:"20:00",mercado:"Mais de 2.5"}]${extra}}`;
  const adm = u => `window.__user={uid:"adm",email:${JSON.stringify(B.ADM)},displayName:"Jorge",providerData:[]};
    window.__db={${u}};`;
  const USERS = [0,1,2,3,4,5].map(i => `"users/u${i}":{status:"approved",name:"Pessoa ${i}",email:"p${i}@teste.local",
    createdAt:{toMillis:()=>Date.parse("2026-11-${10 + i}T12:00:00Z")},lastSeen:{toMillis:()=>Date.now()}}`).join(",");

  /* 38 - texto para WhatsApp */
  let p = await ctx(browser, {viewport: {width: 1150, height: 1000}, isMobile: false, hasTouch: false, deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"]}, adm(USERS + "," + T("t1")));
  await p.goto(URL + "admin/"); await p.waitForSelector(".stats");
  await p.click("[data-tab=tk]"); await p.waitForSelector(".tk");
  await p.locator("[data-wz]").first().click(); await p.waitForTimeout(400);
  const txt = await p.evaluate(() => navigator.clipboard.readText());
  ok(/BILHETE DO PALPITEIRO/.test(txt) && /18\/11\/2026/.test(txt) && /Grêmio x Inter/.test(txt)
    && /Ambas marcam: Sim/.test(txt) && /ABC123/.test(txt) && /opalpiteiro|localhost/.test(txt) && /\+18/.test(txt),
    "mensagem de WhatsApp completa");
  ok(/Nível: \*Seguro\*/.test(txt) && /Odd \*3.20\*/.test(txt), "traz o nível e a odd");
  /* 42 - jogo adiado */
  await p.waitForSelector(".adi", {timeout: 15000});
  const adi = await p.innerText(".adi");
  ok(/saiu da tabela/.test(adi) && /Fantasma x Sumido/.test(adi) && !/Grêmio/.test(adi),
    "avisa só o jogo que sumiu da tabela: " + adi.replace(/\n/g, " ").slice(0, 90));
  await p.screenshot({path: "shots/y1-adiado.png"});
  /* 43 - gráfico */
  await p.click("[data-tab=users]"); await p.waitForSelector(".graf");
  const g = await p.innerText(".graf:not(.cota)");
  ok(/Cota do plano grátis/.test(await p.innerText(".graf.cota")), "painel mostra a cota do plano grátis");
  ok(/6 cadastrados no total/.test(g) && /nos últimos 7 dias/.test(g), "gráfico de crescimento: " + g.replace(/\n/g, " ").slice(0, 60));
  ok(await p.locator(".graf svg path").count() === 2, "a linha do gráfico foi desenhada");
  await p.screenshot({path: "shots/y2-grafico.png"});
  /* 47 - recado */
  await p.click("[data-tab=banner]"); await p.waitForSelector("#b-texto");
  await p.selectOption("#b-ativo", "1"); await p.fill("#b-texto", "Live hoje às 20h no TikTok");
  await p.fill("#b-link", "nao-vale"); await p.click("#b-save");
  ok(/começar com https/.test(await p.innerText("#b-err")), "recusa link inválido no recado");
  await p.fill("#b-link", "https://tiktok.test/zetabela"); await p.fill("#b-bt", "Assistir");
  await p.click("#b-save"); await p.waitForTimeout(500);
  const ban = await p.evaluate(() => window.__db["config/banner"]);
  ok(ban && ban.ativo === true && ban.texto === "Live hoje às 20h no TikTok" && ban.bt === "Assistir", "recado salvo");
  await p.screenshot({path: "shots/y3-recado.png"});
  /* 39 - agendar */
  await p.click("[data-tab=tk]"); await p.waitForSelector(".tk");
  await p.click("#tk-new"); await p.waitForSelector("#t-quando");
  ok(await p.locator("#t-hora-l").isHidden(), "o horário fica escondido até escolher agendar");
  await p.selectOption("#t-quando", "agendar"); await p.fill("#t-hora", "14:30");
  const rows = p.locator(".selrow");
  await rows.nth(0).locator("input").nth(0).fill("A x B"); await rows.nth(0).locator("input").nth(2).fill("Mais de 2.5");
  await p.fill("#t-cod", "ZZZ"); await p.click("#t-save"); await p.waitForTimeout(500);
  const novo = await p.evaluate(() => Object.values(window.__db).find(v => v && v.codigo === "ZZZ"));
  ok(novo && novo.publicarAs && new Date(novo.publicarAs).getHours() !== undefined, "bilhete salvo com horário de publicação");
  await p.waitForSelector(".agd");
  ok(/sai às 14:30/.test(await p.innerText(".agd")), "a lista mostra que está agendado");
  await p.context().close();

  /* app: recado aparece e bilhete agendado não */
  const conta = extra => `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",favs:[]}${extra}};
    try{localStorage.setItem("pal-favs","[]");localStorage.setItem("pal-bemvindo","1")}catch(e){}`;
  p = await ctx(browser, {}, conta(`,"config/banner":{ativo:true,texto:"Live hoje às 20h",link:"https://tiktok.test/z",bt:"Assistir"},
    "tickets/ag":{date:"${HOJE}",tipo:"Seguro",codigo:"AG1",sel:[{jogo:"A x B",mercado:"Mais de 2.5"}],publicarAs:"${iso(3)}"},
    "tickets/ja":{date:"${HOJE}",tipo:"Arriscado",codigo:"JA1",sel:[{jogo:"E x F",mercado:"Vitória do E"}]}`));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.waitForSelector(".recado");
  const rec = await p.innerText(".recado");
  ok(/Live hoje às 20h/.test(rec) && /Assistir/.test(rec), "recado do painel aparece no app");
  ok((await p.locator(".recado a").getAttribute("href")) === "https://tiktok.test/z", "e o botão leva ao link");
  await p.screenshot({path: "shots/y4-recado-app.png"});
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForSelector(".dia");
  const pal = await p.innerText("#app");
  ok(/Vitória do E/.test(pal) && !/Mais de 2.5/.test(pal), "bilhete agendado para mais tarde ainda não aparece");
  await p.context().close();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], "\n", errors.join("\n")); process.exit(1); });
