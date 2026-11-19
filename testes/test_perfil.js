const B = require("./base.js");
const {chromium, devices, srv, ctx, ok, errors} = B;
const PORT = 8774, URL = `http://localhost:${PORT}/ia/`;
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const CRI = Date.parse("2026-10-07T13:00:00Z");
  const conta = (extra = "") => `window.__user={uid:"u1",email:"ana.souza@teste.local",displayName:"Ana",photoURL:"",providerData:[{providerId:"google.com"}]};
    window.__db={"users/u1":{status:"approved",name:"Ana Souza",email:"ana.souza@teste.local",whatsapp:"11988887777",
      provider:"google",photo:"",createdAt:{toMillis:()=>${CRI}},streak:5,lastDay:"2026-11-17",
      favs:[{slug:"flamengo",name:"Flamengo",logo:""}]${extra}}};`;
  let p = await ctx(browser, {}, conta());
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(600);
  ok(await p.locator(".brandrow .av-btn").count() === 1, "ícone de perfil no canto superior direito");
  const pos = await p.evaluate(() => { const r = document.querySelector(".av-btn").getBoundingClientRect();
    const b = document.querySelector(".brandrow").getBoundingClientRect();
    return {direita: Math.abs(r.right - b.right) < 3, cabe: document.documentElement.scrollWidth <= innerWidth, w: Math.round(r.width)}; });
  ok(pos.direita && pos.cabe, `fica na ponta direita e cabe na tela (${pos.w}px)`);
  ok(await p.locator(".av-btn").innerText() === "AS", "sem foto, mostra as iniciais");
  await p.screenshot({path: "shots/p1-header.png"});
  await p.click(".av-btn"); await p.waitForSelector(".pf-top");
  const t = await p.innerText("#app");
  ok(/#perfil$/.test(p.url()), "o ícone abre a tela de perfil");
  ok(/Ana Souza/.test(t) && /ana.souza@teste.local/.test(t) && /\(11\) 98888-7777/.test(t)
    && /Conta Google/.test(t) && /7 de outubro de 2026/.test(t) && /Acesso liberado/.test(t) && /1 time/.test(t),
    "mostra os dados do cadastro: " + t.replace(/\n/g, " ").slice(0, 150));
  ok(/🔥 6 dias seguidos/.test(t), "mostra a sequência de dias (5 de ontem + hoje)");
  ok(await p.locator("#app input, #app textarea, #app select").count() === 0, "não tem nenhum campo para editar");
  ok(/não podem ser alterados aqui/.test(t), "avisa que é só para consulta");
  ok(await p.locator('.pf-bt[href="termos/"]').count() === 1 && await p.locator(".pf-bt.sai").count() === 1,
    "tem termos e sair da conta");
  await p.screenshot({path: "shots/p2-perfil.png", fullPage: true});
  await p.click(".tback"); await p.waitForSelector(".sbar");
  ok(true, "a seta volta para as partidas");
  await p.context().close();
  // com foto do Google
  p = await ctx(browser, {}, conta().replace('photo:""', 'photo:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="'));
  await p.goto(URL); await p.waitForSelector(".av-btn img");
  ok(await p.locator(".av-btn img").count() === 1, "com foto, o ícone mostra a foto");
  await p.goto(URL + "#perfil"); await p.waitForSelector(".pf-foto");
  ok(await p.locator(".pf-foto img").count() === 1, "a foto aparece grande no perfil");
  await p.context().close();
  // celular pequeno
  p = await ctx(browser, {...devices["iPhone SE"]}, conta());
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "cabe no celular pequeno com 🔥 e ícone");
  await p.screenshot({path: "shots/p3-se.png"});
  await p.goto(URL + "#bolao"); await p.waitForSelector(".bl, .empty");
  ok(await p.locator(".brandrow .av-btn").count() === 1, "o ícone também aparece no bolão");
  await p.context().close();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], "\n", errors.join("\n")); process.exit(1); });
