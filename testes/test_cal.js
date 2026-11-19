const B = require("./base.js");
const {chromium, devices, srv, ctx, ok, errors, iso, fs} = B;
const PORT = 8772, URL = `http://localhost:${PORT}/ia/`;
const HOJE = "2026-11-18", MES = "2026-11";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const user = (extra = "") => `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",opens:1,favs:[]}${extra}};
    try{localStorage.setItem("pal-favs","[]")}catch(e){}`;

  /* ---- 1. motor cala a boca ---- */
  let p = await ctx(browser, {}, user());
  await p.goto(URL); await p.waitForSelector(".league");
  const conf = await p.evaluate(() => {
    const poucos = {res: [{gf:1,ga:0,r:"V",home:true},{gf:0,ga:1,r:"D",home:false},{gf:1,ga:1,r:"E",home:true}]};
    const muitos = {res: Array.from({length: 8}, (_, i) => ({gf:1,ga:0,r:"V",home: i % 2 === 0}))};
    return {poucos: !!semDados(poucos, muitos), ok: !!semDados(muitos, muitos),
      vazio: picks({home:"A",away:"B"}, poucos, muitos, null, null).length};
  });
  ok(conf.poucos && !conf.ok && conf.vazio === 0, "sem 4 jogos de cada time o motor não palpita");
  // mercados conferidos certo
  const mk = await p.evaluate(() => {
    const m = {home: "Flamengo", away: "Vasco da Gama"};
    const t = (mk, h, a) => conferirMercado(mk, {h, a}, m);
    return {over: t("Mais de 2.5 gols", 2, 1), under: t("Menos de 2.5 gols", 1, 1),
      btsS: t("Ambas marcam: Sim", 1, 1), btsN: t("Ambas marcam: Não", 2, 0),
      vit: t("Vitória do Flamengo", 2, 0), vitN: t("Vitória do Flamengo", 0, 2),
      dc: t("Vasco ou empate", 1, 1), marca: t("Flamengo marca: Sim", 0, 3),
      desconhecido: t("Escanteios acima de 9", 1, 1)};
  });
  ok(mk.over && mk.under && mk.btsS && mk.btsN && mk.vit && !mk.vitN && mk.dc && !mk.marca && mk.desconhecido === null,
    "cada mercado é conferido certo: " + JSON.stringify(mk));
  await p.context().close();

  /* ---- 2. medição grava antes e confere depois ---- */
  p = await ctx(browser, {}, user());
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty, .quieto");
  await p.waitForTimeout(700);
  const gravado = await p.evaluate(() => Object.entries(window.__db).filter(([k]) => k.startsWith("calibra/")).map(([k, v]) => ({k, ...v})));
  ok(gravado.length === 1 && gravado[0].k === "calibra/fla-vas" && gravado[0].avaliado === false && gravado[0].placar === null
    && gravado[0].picks.length > 0 && gravado[0].dia === "2026-11-18" && gravado[0].mes === "2026-11" && gravado[0].slug === "fla-vas",
    "palpites gravados antes do jogo: " + JSON.stringify(gravado[0] && {n: gravado[0].picks.length, dia: gravado[0].dia}));
  ok(gravado[0].picks.every(x => typeof x.mk === "string" && typeof x.conf === "number"), "cada palpite guarda mercado e confiança");
  await p.context().close();

  // o jogo acabou 3x0 — Flamengo venceu, mais de 2.5, ambas não marcam
  const fx = B.fixtures["brazilian-serie-a"][0];
  const antes = {s: fx.status, h: fx.home_score, a: fx.away_score, t: fx.time};
  fx.status = "finished"; fx.home_score = 3; fx.away_score = 0; fx.time = iso(-2);
  const picksGravados = [{mk: "Vitória do Flamengo", conf: 73}, {mk: "Mais de 2.5 gols", conf: 66}, {mk: "Ambas marcam: Sim", conf: 61}];
  p = await ctx(browser, {}, user(`,"calibra/fla-vas":{matchId:"fla-vas",jogo:"Flamengo x Vasco",dia:"${HOJE}",mes:"${MES}",slug:"fla-vas",
    kick:{toMillis:()=>Date.now()-7200000},picks:${JSON.stringify(picksGravados)},placar:null,acertos:[],avaliado:false}`));
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(3000);
  const res = await p.evaluate(() => window.__db["calibra/fla-vas"]);
  ok(res.avaliado === true && res.placar.h === 3 && res.placar.a === 0, "resultado gravado depois do jogo: " + JSON.stringify(res.placar));
  ok(JSON.stringify(res.acertos) === "[true,true,false]", "acertos conferidos: " + JSON.stringify(res.acertos));
  await p.context().close();
  Object.assign(fx, {status: antes.s, home_score: antes.h, away_score: antes.a, time: antes.t});

  /* ---- 3. casas de apostas ---- */
  const CASAS = `,"casas/c1":{nome:"Bingo em Casa",curto:"Bingo",link:"https://bingo.test/sb?q={q}",ordem:0,ativa:true},
    "casas/c2":{nome:"Betano Brasil",curto:"Betano",link:"https://betano.test/apostas",ordem:1,ativa:true},
    "casas/c3":{nome:"Casa Desligada",curto:"Off",link:"https://off.test",ordem:2,ativa:false}`;
  p = await ctx(browser, {}, user(CASAS));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick .odd-b");
  const info = await p.evaluate(() => [...document.querySelectorAll(".pick")][0] &&
    [...[...document.querySelectorAll(".pick")][0].querySelectorAll(".odd-b")].map(a => ({t: a.textContent.trim(), h: a.getAttribute("href")})));
  ok(info.length === 2, "só as casas ativas viram botão: " + info.length);
  ok(info[0].t === "Bingo" && /q=Flamengo%20Vasco/.test(info[0].h), "o {q} vira o nome dos times: " + info[0].h);
  ok(info[1].t === "Betano" && info[1].h === "https://betano.test/apostas", "casa sem {q} usa o link direto");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "os botões cabem na tela");
  await p.screenshot({path: "shots/c1-casas.png"});
  await p.context().close();
  p = await ctx(browser, {}, user());
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".odd-b");
  ok(await p.locator(".pick").first().locator(".odd-b").innerText() === "Ver odd", "sem casa cadastrada, fica o botão padrão");
  await p.context().close();

  /* ---- 4. painel: acertos, casas, admins, backup ---- */
  const feitos = [];
  for (let i = 0; i < 12; i++) feitos.push(`"calibra/g${i}":{matchId:"g${i}",jogo:"Time A x Time B",dia:"${HOJE}",mes:"${MES}",avaliado:true,
    placar:{h:2,a:1},picks:[{mk:"Mais de 2.5 gols",conf:${80 + (i % 5)}},{mk:"Vitória do A",conf:${62 + (i % 6)}}],
    acertos:[${i % 4 !== 0},${i % 2 === 0}]}`);
  const adm = `window.__user={uid:"adm",email:${JSON.stringify(B.ADM)},displayName:"Jorge",providerData:[]};
    window.__db={"users/c":{status:"approved",name:"Ana",email:"a@teste.local",createdAt:{toMillis:()=>Date.now()},lastSeen:{toMillis:()=>Date.now()}},
      "users/c/days/${HOJE}":{date:"${HOJE}",opens:2},
      "tickets/t1":{date:"${HOJE}",tipo:"Seguro",odd:"2.1",codigo:"A1",clicks:3,sel:[{jogo:"A x B",mercado:"Mais de 2.5"}]},
      "casas/c1":{nome:"Bingo em Casa",curto:"Bingo",link:"https://bingo.test/sb",ordem:0,ativa:true},
      ${feitos.join(",")}};`;
  p = await ctx(browser, {viewport: {width: 1150, height: 1000}, isMobile: false, hasTouch: false, deviceScaleFactor: 1}, adm);
  await p.goto(URL + "admin/"); await p.waitForSelector(".stats");
  await p.click("[data-tab=cal]"); await p.waitForSelector(".cal");
  const resumo = await p.innerText(".conv");
  ok(/24/.test(resumo) && /palpites medidos/.test(resumo), "painel conta os palpites medidos: " + resumo.replace(/\n/g, " ").slice(0, 70));
  const faixas = await p.$$eval(".cal table tbody tr", e => e.map(x => x.innerText.replace(/\t/g, " | ")));
  ok(faixas.length >= 2 && /80–100%/.test(faixas[0]), "tabela por faixa de confiança: " + faixas[0]);
  ok(/pts/.test(await p.innerText(".cal")), "mostra a diferença entre prometido e acontecido");
  ok(/Mais de 2.5 gols/.test(await p.innerText(".cal:last-of-type")), "tabela por tipo de palpite");
  await p.screenshot({path: "shots/c2-acertos.png"});
  await p.click("[data-tab=casas]"); await p.waitForSelector(".casa");
  ok(/Bingo em Casa/.test(await p.innerText(".casa")), "painel lista as casas");
  await p.click("#ca-new"); await p.waitForSelector("#c-nome");
  await p.fill("#c-nome", "Betano"); await p.fill("#c-curto", "Betano"); await p.fill("#c-link", "nao-e-link");
  await p.click("#c-save");
  ok(/começar com https/.test(await p.innerText("#c-err")), "recusa link inválido");
  await p.fill("#c-link", "https://betano.test/x?s={q}"); await p.click("#c-save"); await p.waitForTimeout(400);
  const nova = await p.evaluate(() => Object.values(window.__db).find(v => v && v.nome === "Betano"));
  ok(nova && nova.link === "https://betano.test/x?s={q}" && nova.ativa === true, "casa nova salva");
  await p.screenshot({path: "shots/c3-casas-admin.png"});
  // admins
  await p.click("[data-tab=adm]"); await p.waitForSelector("#adm-add");
  ok(/Dono/.test(await p.innerText(".adm")), "o dono aparece fixo na lista");
  await p.fill("#adm-novo", "socio"); await p.click("#adm-add");
  ok(/e-mail válido/.test(await p.innerText("#adm-err")), "recusa e-mail inválido");
  await p.fill("#adm-novo", "socio@teste.local"); await p.click("#adm-add"); await p.waitForTimeout(400);
  ok(JSON.stringify((await p.evaluate(() => window.__db["config/admins"])).emails) === '["socio@teste.local"]', "segundo admin salvo");
  await p.screenshot({path: "shots/c4-admins.png"});
  // backup
  const dl = p.waitForEvent("download"); await p.click("#bkp"); const d = await dl;
  const js = JSON.parse(fs.readFileSync(await d.path(), "utf8"));
  ok(js.users.length === 1 && js.tickets.length === 1 && js.calibra.length === 12 && js.casas.length >= 1
    && js.diasDeUso && js.diasDeUso.c && js.admins, "backup traz tudo: " + Object.keys(js).join(", "));
  await p.context().close();
  // segundo admin entra, mas não mexe na lista de admins
  p = await ctx(browser, {viewport: {width: 1150, height: 900}, isMobile: false, hasTouch: false},
    `window.__user={uid:"s1",email:"socio@teste.local",displayName:"Sócio",providerData:[]};
     window.__db={"config/admins":{emails:["socio@teste.local"]},"users/c":{status:"approved",name:"Ana",createdAt:{toMillis:()=>Date.now()}}};`);
  await p.goto(URL + "admin/"); await p.waitForSelector(".stats");
  ok(await p.locator("[data-tab=adm]").count() === 0, "segundo admin não vê a aba de administradores");
  ok(await p.locator("[data-tab=cal]").count() === 1, "mas usa o resto do painel");
  await p.context().close();
  // quem não é admin continua barrado
  p = await ctx(browser, {}, user());
  await p.goto(URL + "admin/"); await p.waitForSelector("#er:not([hidden])");
  ok(/não é administradora/.test(await p.innerText("#er")), "conta comum continua barrada no painel");
  await p.context().close();

  /* ---- 5. bilhetes montados sozinhos de manhã ---- */
  const extras = [["pal-fla", "Palmeiras", "Flamengo", 10], ["int-pal", "Internacional", "Palmeiras", 11]]
    .map(([id, h, a, t]) => ({url: `/football/match/${id}/`, home: h, away: a, home_logo: "", away_logo: "", time: iso(t),
      status: "upcoming", status_text: "upcoming", home_score: null, away_score: null, competition: "Liga"}));
  B.fixtures["brazilian-serie-a"].push(...extras);
  const admApp = `window.__user={uid:"adm",email:${JSON.stringify(B.ADM)},displayName:"Jorge",providerData:[]};
    window.__db={"users/adm":{status:"approved",name:"Jorge",opens:1,favs:[]}};try{localStorage.setItem("pal-favs","[]")}catch(e){}`;
  p = await ctx(browser, {}, admApp);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForSelector(".gerar .ready", {timeout: 60000});
  ok(true, "admin abre o app e os bilhetes já vêm montados, sem apertar nada");
  ok(await p.evaluate(() => localStorage.getItem("pal-autogera")) === "2026-11-18", "marca que já montou hoje");
  await p.screenshot({path: "shots/c5-auto.png"});
  await p.click(".gerar .g2 .ghost");           // cancela
  await p.locator(".seg button", {hasText: "Partidas"}).click();
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForTimeout(1200);
  ok(await p.locator(".gerar .ready").count() === 0 && await p.locator(".gerar .gen").count() === 1,
    "não monta de novo no mesmo dia: volta o botão manual");
  await p.context().close();
  // já existindo bilhete do dia, não monta nada
  p = await ctx(browser, {}, admApp + `window.__db["tickets/j1"]={date:"${HOJE}",tipo:"Seguro",sel:[{jogo:"A x B",mercado:"X"}]};`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForSelector(".ready-btn");
  await p.waitForTimeout(1500);
  ok(await p.locator(".gerar .ready").count() === 0, "com bilhete já publicado, não monta sozinho");
  await p.context().close();
  extras.forEach(x => B.fixtures["brazilian-serie-a"].splice(B.fixtures["brazilian-serie-a"].indexOf(x), 1));

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], "\n", errors.join("\n")); process.exit(1); });
