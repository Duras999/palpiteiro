const B = require("./base.js");
const {chromium, srv, ctx, ok, errors, jogo, addLiga, tirarLiga, ADM} = B;
const PORT = 8784, URL = `http://localhost:${PORT}/ia/`;
const ontem = "2026-11-17";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  // jogos de ontem, já terminados
  addLiga("passado", [
    jogo("pal-fla-x", "Palmeiras", "Flamengo", -17, "finished", 2, 1),
    jogo("ars-liv-x", "Arsenal", "Liverpool", -20, "finished", 0, 0)
  ]);
  const bilhetes = {
    "tickets/tg": {date: ontem, tipo: "Seguro", odd: "1.80", order: 0,
      sel: [{jogo: "Palmeiras x Flamengo", mercado: "Vitória do Palmeiras"}]},
    "tickets/tr": {date: ontem, tipo: "Médio", odd: "3.20", order: 1,
      sel: [{jogo: "Arsenal x Liverpool", mercado: "Ambas marcam: Sim"},
            {jogo: "Palmeiras x Flamengo", mercado: "Mais de 2.5 gols"}]}};
  const entra = (uid, email, nome) => `
    window.__user={uid:${JSON.stringify(uid)},email:${JSON.stringify(email)},displayName:${JSON.stringify(nome)},providerData:[]};
    window.__db=Object.assign({"users/${uid}":{status:"approved",name:${JSON.stringify(nome)},opens:3}},${JSON.stringify(bilhetes)});
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`;

  /* ---------- o administrador confere sozinho ---------- */
  let p = await ctx(browser, {}, entra("a1", ADM, "Jorge"));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForFunction(() => window.__db["tickets/tg"].resultado, null, {timeout: 20000});
  const tg = await p.evaluate(() => window.__db["tickets/tg"]);
  const tr = await p.evaluate(() => window.__db["tickets/tr"]);
  ok(tg.resultado === "green" && tg.acertos.join() === "true", "bilhete que bateu vira green");
  ok(tr.resultado === "red" && tr.acertos.join() === "false,true", "bilhete com uma errada vira red, marcando qual errou");
  ok(!!tg.conferidoEm, "guarda quando foi conferido");

  /* ---------- o resumo público é gravado ---------- */
  await p.waitForFunction(() => window.__db["config/publico"], null, {timeout: 10000});
  const pub = await p.evaluate(() => window.__db["config/publico"]);
  ok(pub.total.g === 1 && pub.total.r === 1, "resumo público conta 1 green e 1 red");
  ok(pub.dias.length === 1 && pub.dias[0].d === "2026-11-17", "resumo público separa por dia");
  ok(pub.ult.length === 2 && pub.ult[0].sel[0].jogo && typeof pub.ult[0].sel[0].ok === "boolean",
    "resumo público leva os jogos de cada bilhete com o que acertou");
  ok(!pub.ult.some(b => JSON.stringify(b).includes("uid") || JSON.stringify(b).includes("@")),
    "o resumo público não leva nada de usuário");

  /* ---------- a tela do retrospecto ---------- */
  await p.evaluate(() => go("retro"));
  await p.waitForSelector(".retro", {timeout: 10000});
  const t = await p.innerText(".retro");
  ok(/1\s*green/.test(t) && /1\s*red/.test(t), "retrospecto mostra os números: " + t.split("\n").slice(0, 2).join(" "));
  ok(/50%/.test(t), "retrospecto mostra o aproveitamento");
  const bil = await p.locator(".ready").count();
  ok(bil === 2, "lista os dois bilhetes conferidos");
  const tags = await p.$$eval(".ready-tag", e => e.map(x => x.textContent.trim()));
  ok(tags.includes("GREEN") && tags.includes("RED"), "cada bilhete com seu selo: " + tags.join(", "));
  ok(/não garante o próximo/.test(await p.innerText(".ready-note")), "avisa que o passado não garante o próximo");
  ok(await p.locator("#rt-conf").count() === 1, "administrador tem o botão de conferir na hora");

  /* ---------- item 16: a imagem do resultado do dia ---------- */
  ok(await p.locator("#rt-img").count() === 1, "tem botão para gerar a imagem do dia");
  const img = await p.evaluate(() => {
    const c = imagemDoResultado(retro, retro.ult[0].date);
    const x = c.getContext("2d");
    const branco = x.getImageData(80, 980, 10, 10).data;
    return {w: c.width, h: c.height, temQr: branco[0] > 200 && branco[1] > 200 && branco[2] > 200};
  });
  ok(img.w === 1080 && img.h === 1350, "imagem do resultado sai no mesmo formato de postar");
  ok(img.temQr, "o QR do retrospecto aparece na imagem");
  await p.evaluate(() => { delete navigator.canShare; });
  const [baixou] = await Promise.all([
    p.waitForEvent("download", {timeout: 15000}),
    p.locator("#rt-img").click()
  ]);
  ok(/^palpiteiro-resultado-2026-11-17\.png$/.test(baixou.suggestedFilename()),
    "o arquivo sai com o dia no nome: " + baixou.suggestedFilename());
  await p.screenshot({path: "shots/r1-retro.png", fullPage: true});
  await p.context().close();

  /* ---------- usuário comum vê o retrospecto, mas não confere nada ---------- */
  const jaFeito = {...bilhetes};
  jaFeito["tickets/tg"] = {...jaFeito["tickets/tg"], resultado: "green", acertos: [true]};
  jaFeito["tickets/tr"] = {...jaFeito["tickets/tr"], resultado: "red", acertos: [false, true]};
  p = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db=Object.assign({"users/u1":{status:"approved",name:"Ana",opens:3}},${JSON.stringify(jaFeito)});
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.evaluate(() => go("retro"));
  await p.waitForSelector(".retro", {timeout: 10000});
  ok(/50%/.test(await p.innerText(".retro")), "usuário comum também vê o retrospecto");
  ok(await p.locator("#rt-conf").count() === 0, "usuário comum não tem o botão de conferir");
  await p.waitForTimeout(800);
  ok(!(await p.evaluate(() => !!window.__db["config/publico"])), "usuário comum não escreve o resumo público");

  /* ---------- link para chegar lá ---------- */
  await p.evaluate(() => go(""));
  await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForTimeout(400);
  ok(/retrospecto/i.test(await p.innerText("#app")), "a aba Palpites convida a ver o retrospecto");
  await p.context().close();

  /* ---------- jogo que não achou fica para o dia seguinte ---------- */
  tirarLiga("passado");
  p = await ctx(browser, {}, entra("a1", ADM, "Jorge"));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForTimeout(2500);
  ok(!(await p.evaluate(() => window.__db["tickets/tg"].resultado)),
    "sem achar o jogo, o bilhete não é marcado no chute");
  await p.context().close();

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
