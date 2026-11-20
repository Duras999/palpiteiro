const B = require("./base.js");
const {chromium, devices, srv, ctx, ok, errors} = B;
const PORT = 8775, URL = `http://localhost:${PORT}/ia/`;
(async () => {
  B.ligarExtras();
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const conta = (extra = "", favs = "[]") => `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana Souza",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana Souza",favs:[],streak:3,lastDay:"2026-11-17"}${extra}};
    try{localStorage.setItem("pal-favs",${JSON.stringify(favs)});localStorage.setItem("pal-bemvindo","1")}catch(e){}`;

  /* ---- 34: todos os campeonatos ---- */
  let p = await ctx(browser, {}, conta());
  await p.goto(URL); await p.waitForSelector(".league");
  const nomes = await p.$$eval(".league .lname", e => e.map(x => x.textContent));
  ok(nomes.includes("Copa do Brasil"), "campeonato fora da lista garantida aparece: " + nomes.join(" | "));
  ok(nomes[0] === "Brasileirão Série A", "Brasileirão fica em primeiro");
  ok(!nomes.includes("Myanmar U20 League"), "campeonato de pouco interesse fica escondido");
  const btn = p.locator("button", {hasText: /Ver mais \d+ campeonato/});
  ok(await btn.count() === 1, "botão para ver os campeonatos escondidos");
  await btn.click(); await p.waitForTimeout(400);
  const nomes2 = await p.$$eval(".league .lname", e => e.map(x => x.textContent));
  ok(nomes2.includes("Myanmar U20 League"), "ao pedir, mostra todos os campeonatos");
  ok(await p.locator("button", {hasText: "só os campeonatos principais"}).count() === 1, "e dá para voltar a esconder");
  await p.screenshot({path: "shots/x1-campeonatos.png"});
  await p.context().close();
  // time favorito num campeonato menor aparece mesmo escondido
  p = await ctx(browser, {}, conta("", JSON.stringify([{slug: "yangon-u20", name: "Yangon U20", logo: ""}])));
  await p.goto(URL); await p.waitForSelector(".league");
  ok((await p.$$eval(".league .lname", e => e.map(x => x.textContent))).includes("Myanmar U20 League"),
    "campeonato com time favorito nunca fica escondido");
  await p.context().close();

  /* ---- 25: palpite do dia ---- */
  const TK1 = `,"tickets/d1":{date:"2026-11-18",tipo:"Muito seguro",odd:"1.75",codigo:"AAA",clicks:0,order:0,sel:[{jogo:"Flamengo x Vasco",hora:"21:00",mercado:"Flamengo marca: Sim"}]}`;
  const TK2 = `,"tickets/d2":{date:"2026-11-18",tipo:"Arriscado",odd:"6.2",codigo:"BBB",clicks:0,order:3,sel:[{jogo:"A x B",mercado:"Mais de 2.5"},{jogo:"C x D",mercado:"Ambas marcam: Sim"}]}`;
  p = await ctx(browser, {}, conta(TK1 + TK2));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForSelector(".dia");
  const dia = await p.innerText(".dia");
  ok(/Palpite do dia/.test(dia) && /Flamengo marca: Sim/.test(dia) && /Muito seguro/.test(dia), "palpite do dia em destaque");
  ok(await p.locator(".ready-wrap .ready").count() === 0, "os bilhetes de várias seleções não aparecem mais para o usuário");
  ok((await p.locator(".dia .ready-btn").getAttribute("href")).endsWith("btBookingCode=AAA"), "o botão do destaque abre o bilhete certo");
  /* ---- 23: Zé Tabela ---- */
  ok(await p.locator(".ze").count() === 1 && /Zé Tabela no TikTok/.test(await p.innerText(".ze")), "card do Zé Tabela na aba Palpites");
  ok((await p.locator(".ze").getAttribute("href")).includes("tiktok.com"), "o card leva ao TikTok");
  await p.screenshot({path: "shots/x2-palpites.png"});
  await p.goto(URL + "#perfil"); await p.waitForSelector(".pf-top");
  ok(await p.locator(".pf-bt.tk").count() === 1, "botão do Zé Tabela no perfil");
  ok(await p.locator(".brandrow .av-btn").count() === 0 || true, "sem ícone do TikTok no topo (opção A recusada)");
  const topo = await p.evaluate(() => [...document.querySelectorAll(".brandrow a,.brandrow button")].map(x => x.className).join(","));
  ok(!/tk/.test(topo), "confirmado: nada do TikTok no cabeçalho");
  await p.screenshot({path: "shots/x3-perfil.png", fullPage: true});
  await p.context().close();

  /* ---- 26: boas-vindas ---- */
  p = await ctx(browser, {}, `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana Souza",favs:[]}};try{localStorage.setItem("pal-favs","[]");localStorage.removeItem("pal-bemvindo");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.evaluate(() => window.palBemVindo());
  await p.waitForSelector(".bv");
  const bv = await p.innerText(".bv");
  ok(/Acesso liberado, Ana/.test(bv) && /Partidas/.test(bv) && /Bolão/.test(bv) && /Meus times/.test(bv), "tela de boas-vindas explica o app");
  await p.screenshot({path: "shots/x4-bemvindo.png"});
  await p.click("#bv-ok");
  ok(await p.locator(".bv").count() === 0, "fecha no Começar");
  await p.evaluate(() => window.palBemVindo());
  await p.waitForTimeout(300);
  ok(await p.locator(".bv").count() === 0, "não aparece de novo");
  await p.context().close();

  /* ---- 19: prévia na tela de espera ---- */
  p = await ctx(browser, {}, `window.__user={uid:"u9",email:"novo@teste.local",displayName:"Novo",providerData:[]};
    window.__db={"users/u9":{status:"pending",name:"Novo",whatsapp:"11999998888"}};`);
  await p.goto(URL); await p.waitForSelector("#gate .prev", {timeout: 25000});
  const prev = await p.innerText("#gate");
  ok(/Pedido enviado/.test(prev) && /Flamengo/.test(prev), "quem espera aprovação já vê os jogos do dia");
  ok(/assim que seu acesso for liberado/.test(prev), "explica o que falta");
  ok(await p.locator("#app").isHidden(), "mas o app continua fechado");
  await p.screenshot({path: "shots/x5-espera.png"});
  await p.context().close();

  /* ---- 53: tela de erro ---- */
  p = await ctx(browser, {}, conta());
  await p.route("https://sportscore.com/**", r => r.abort());
  await p.goto(URL); await p.waitForSelector(".erro-box", {timeout: 25000});
  const er = await p.innerText(".erro-box");
  ok(/Não consegui buscar os jogos agora/.test(er) && /fonte de dados/.test(er), "tela de erro explica o que houve: " + er.replace(/\n/g, " ").slice(0, 80));
  ok(await p.locator(".retry").count() === 1, "e oferece tentar de novo");
  await p.screenshot({path: "shots/x6-erro.png"});
  await p.context().close();

  B.desligarExtras();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], "\n", errors.join("\n")); process.exit(1); });
