const B = require("./base.js");
const {chromium, srv, ctx, ok, errors} = B;
const PORT = 8773, URL = `http://localhost:${PORT}/ia/`, HOJE = "2026-11-18";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const T = (id, cod, casaLink) => `"tickets/${id}":{date:"${HOJE}",tipo:"Seguro",odd:"2.1",codigo:${JSON.stringify(cod)},
    ${casaLink ? `casaLink:${JSON.stringify(casaLink)},` : ""}clicks:0,order:1,
    sel:[{jogo:"Grêmio x Inter",hora:"19:00",mercado:"Ambas marcam: Sim"}]}`;

  /* app: botão honesto sem código */
  const abrirPalpites = async (bilhetes) => {
    const q = await ctx(browser, {}, `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
      window.__db={"users/u1":{status:"approved",name:"Ana",favs:[]},${bilhetes}};
      try{localStorage.setItem("pal-favs","[]")}catch(e){}`);
    await q.goto(URL); await q.waitForSelector(".league");
    await q.locator(".seg button", {hasText: "Palpites"}).click(); await q.waitForSelector(".ready-btn");
    return q;
  };
  let p = await abrirPalpites(T("semcod", ""));
  let bt = await p.$eval(".ready-btn", x => ({t: x.textContent.trim(), h: x.getAttribute("href")}));
  ok(bt.t === "Abrir a casa" && bt.h === "https://www.bingoemcasa17.com/pt-BR/sportsbook",
    "sem código: abre a casa, não o cadastro — " + bt.h);
  await p.context().close();

  p = await abrirPalpites(T("comcod", "ABC123"));
  bt = await p.$eval(".ready-btn", x => ({t: x.textContent.trim(), h: x.getAttribute("href")}));
  ok(bt.t === "Apostar" && bt.h.endsWith("btBookingCode=ABC123"), "com código: abre o bilhete montado");
  await p.context().close();
  // com casa própria cadastrada
  p = await ctx(browser, {}, `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",favs:[]},${T("t1", "ZZ9", "https://casa.test/sb?code=")}};
    try{localStorage.setItem("pal-favs","[]")}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForSelector(".ready-btn");
  ok(await p.locator(".ready-btn").getAttribute("href") === "https://casa.test/sb?code=ZZ9", "usa a casa escolhida no painel");
  await p.context().close();

  /* painel: colar os códigos */
  const adm = `window.__user={uid:"adm",email:${JSON.stringify(B.ADM)},displayName:"Jorge",providerData:[]};
    window.__db={"users/c":{status:"approved",name:"Ana",createdAt:{toMillis:()=>Date.now()}},
      ${T("a1", "")},${T("a2", "")},${T("a3", "JAITEM")}};`;
  p = await ctx(browser, {viewport: {width: 1150, height: 950}, isMobile: false, hasTouch: false, deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"]}, adm);
  await p.goto(URL + "admin/"); await p.waitForSelector(".stats");
  await p.click("[data-tab=tk]"); await p.waitForSelector(".cods");
  ok(/2 bilhetes sem código/.test(await p.innerText(".cods h4")), "painel avisa quantos estão sem código");
  ok(await p.locator("[data-cod]").count() === 2, "um campo por bilhete sem código (os com código ficam de fora)");
  ok(/só abre a casa/.test(await p.innerText(".list")), "a lista marca o bilhete sem código");
  await p.screenshot({path: "shots/k1-codigos.png"});
  await p.locator("[data-copy]").first().click(); await p.waitForTimeout(300);
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  ok(copiado === "Grêmio x Inter 19:00 - Ambas marcam: Sim",
    "Copiar jogos entrega a lista pronta para montar na casa");
  await p.locator("[data-cod]").nth(0).fill("abc 123");
  await p.locator("[data-cod]").nth(1).fill("xyz789");
  await p.click("#cod-save"); await p.waitForTimeout(600);
  const salvos = await p.evaluate(() => [window.__db["tickets/a1"].codigo, window.__db["tickets/a2"].codigo, window.__db["tickets/a3"].codigo]);
  ok(salvos[0] === "ABC123" && salvos[1] === "XYZ789" && salvos[2] === "JAITEM",
    "códigos salvos de uma vez, sem espaço e em maiúscula: " + salvos.join(", "));
  await p.waitForSelector(".cods", {state: "detached"});
  ok(true, "o aviso some quando todos têm código");
  await p.screenshot({path: "shots/k2-depois.png"});
  await p.context().close();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], "\n", errors.join("\n")); process.exit(1); });
