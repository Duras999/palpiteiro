const B = require("./base.js");
const {chromium, srv, ctx, ok, errors, ADM} = B;
const PORT = 8786, URL = `http://localhost:${PORT}/ia/`;
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  // palpites já conferidos: o app prometeu 80% e acertou 50% nos cartões
  const medidos = {};
  const add = (id, dia, mk, conf, ok) => {
    medidos["calibra/" + id] = {matchId: id, dia, mes: dia.slice(0, 7), jogo: "A x B", avaliado: true,
      picks: [{mk, conf}], acertos: [ok], placar: {h: 1, a: 0}};
  };
  for (let i = 0; i < 40; i++) add("c" + i, "2026-11-10", "Mais de 4.5 cartões", 80, i % 2 === 0);
  for (let i = 0; i < 40; i++) add("v" + i, "2026-11-10", "Vitória do Flamengo", 70, i % 10 >= 3);  // acerta 70%, igual ao prometido
  for (let i = 0; i < 8; i++) add("p" + i, "2026-11-10", "Empate no 1º tempo", 75, false);
  const entra = (uid, email) => `
    window.__user={uid:${JSON.stringify(uid)},email:${JSON.stringify(email)},displayName:"J",providerData:[]};
    window.__db=Object.assign({"users/${uid}":{status:"approved",name:"J",opens:3}},${JSON.stringify(medidos)});
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`;

  /* ---------- o administrador calibra sozinho ---------- */
  let p = await ctx(browser, {}, entra("a1", ADM));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForFunction(() => window.__db["config/calibragem"], null, {timeout: 20000});
  const cal = await p.evaluate(() => window.__db["config/calibragem"]);
  const A = cal.ajustes || {};
  ok(A.cartoes && A.cartoes.d < 0, "mercado que prometia demais leva desconto: " + JSON.stringify(A.cartoes));
  ok(A.cartoes.d >= -10, "o desconto tem teto, não despenca de uma vez (" + A.cartoes.d + ")");
  ok(!A.empate1t, "mercado com pouca amostra não é mexido");
  ok(!A.vitoria, "mercado que entrega o que promete não é mexido: " + JSON.stringify(A.vitoria || "nenhum"));
  const subiu = await p.evaluate(() => calcularAjustes(
    Array.from({length: 60}, (_, i) => ({picks: [{mk: "Vitória do X", conf: 55}], acertos: [i % 10 < 8]}))));
  ok(subiu.vitoria && subiu.vitoria.d > 0, "mercado que entrega mais do que promete sobe: " + JSON.stringify(subiu.vitoria));
  ok(cal.amostra === 88, "guarda de quantos palpites tirou a conta");

  /* ---------- a conta em si ---------- */
  const conta = await p.evaluate(() => {
    const medidos = [];
    for (let i = 0; i < 100; i++) medidos.push({picks: [{mk: "Mais de 2.5 gols", conf: 90}], acertos: [i < 50]});
    return calcularAjustes(medidos);
  });
  ok(conta.gols && conta.gols.d === -10, "prometer 90 e acertar 50 leva o desconto máximo: " + conta.gols.d);
  const poucos = await p.evaluate(() => calcularAjustes(
    Array.from({length: 24}, () => ({picks: [{mk: "Mais de 2.5 gols", conf: 90}], acertos: [false]}))));
  ok(!poucos.gols, "com menos de 25 palpites não mexe em nada");
  await p.context().close();

  /* ---------- o palpite sai já corrigido ---------- */
  p = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",opens:3},
      "config/calibragem":{ajustes:{vitoria:{d:-8,n:120}}}};
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.waitForFunction(() => window.palAjuste, null, {timeout: 10000});
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick, .empty");
  const comAjuste = await p.$$eval(".pick", e => e.map(x => ({mk: x.querySelector(".mk").textContent, conf: +x.querySelector(".pct").textContent.replace("%", "")})));
  const vit = comAjuste.find(x => /^Vitória do/.test(x.mk));
  ok(!!vit, "o palpite de vitória continua saindo");
  ok(/corrigidos para baixo/.test(await p.innerText(".aviso-conf")), "o app conta que corrigiu para baixo");
  ok(/conferiu 120 palpites/.test(await p.innerText(".aviso-conf")), "e de quantos palpites tirou isso");
  await p.context().close();

  // mesmo jogo, sem calibragem: a confiança tem que ser maior
  p = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",opens:3}};
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick, .empty");
  const sem = await p.$$eval(".pick", e => e.map(x => ({mk: x.querySelector(".mk").textContent, conf: +x.querySelector(".pct").textContent.replace("%", "")})));
  const vit2 = sem.find(x => /^Vitória do/.test(x.mk));
  ok(vit2 && vit && vit2.conf - vit.conf === 8, `a correção de 8 pontos aparece mesmo: sem=${vit2 && vit2.conf}% com=${vit && vit.conf}%`);
  ok(!/corrigidos/.test(await p.innerText(".aviso-conf")), "sem calibragem, não inventa aviso nenhum");
  await p.context().close();

  /* ---------- usuário comum não calibra ---------- */
  p = await ctx(browser, {}, entra("u1", "ana@teste.local"));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForTimeout(1500);
  ok(!(await p.evaluate(() => !!window.__db["config/calibragem"])), "usuário comum não escreve a calibragem");
  await p.context().close();

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
