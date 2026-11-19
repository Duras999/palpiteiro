const B = require("./base.js");
const {chromium, srv, ctx, ok, errors, setDet} = B;
const PORT = 8779, URL = `http://localhost:${PORT}/ia/`;
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const conta = () => `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana Souza",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana Souza",opens:1}};
    try{localStorage.setItem("pal-favs","[]");localStorage.clear();}catch(e){}`;
  const abrir = async () => {
    const p = await ctx(browser, {}, conta());
    await p.goto(URL); await p.waitForSelector(".league");
    await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
    await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick, .empty");
    return p;
  };
  const mercados = p => p.$$eval(".pick .mk", e => e.map(x => x.textContent.trim()));
  const porque = (p, mk) => p.locator(".pick", {hasText: mk}).first().locator(".why").innerText();

  /* ---------- handicap (sai na hora, sem busca extra) ---------- */
  setDet({});
  let p = await abrir();
  let mk = await mercados(p);
  ok(mk.some(x => /^Flamengo -1 \(vence por 2 ou mais\)$/.test(x)),
    "handicap do favorito aparece: " + mk.join(" | "));
  ok(/venceu por 2 ou mais em 3 dos 5 jogos em casa/.test(await porque(p, "Flamengo -1")),
    "explica o handicap com os números dos últimos jogos");

  /* ---------- primeiro tempo (entra quando os detalhes chegam) ---------- */
  await p.waitForSelector(".pick .mk:text-matches('1º tempo')", {timeout: 15000});
  mk = await mercados(p);
  ok(mk.some(x => x === "Mais de 0.5 gol no 1º tempo"), "mercado de primeiro tempo entra na lista: " + mk.join(" | "));
  ok(/primeiro tempo em 5 dos 5 jogos do Flamengo/.test(await porque(p, "Mais de 0.5 gol no 1º tempo")),
    "explica o primeiro tempo com a contagem dos jogos");
  ok(mk.length <= 5, "no máximo 5 palpites por jogo (tem " + mk.length + ")");
  await p.context().close();

  /* ---------- empate no primeiro tempo ---------- */
  setDet({"Flamengo": {y: [2, 2], ht: [0, 0]}, "Vasco da Gama": {y: [2, 2], ht: [1, 1]}});
  p = await abrir();
  await p.waitForSelector(".pick .mk:text-matches('1º tempo')", {timeout: 15000});
  mk = await mercados(p);
  ok(mk.some(x => x === "Empate no 1º tempo"), "0 a 0 e 1 a 1 no intervalo viram empate no 1º tempo: " + mk.join(" | "));
  await p.context().close();

  /* ---------- cartões ---------- */
  setDet({"Flamengo": {y: [4, 3], ht: [1, 0]}, "Vasco da Gama": {y: [3, 3], ht: [1, 0]}});
  p = await abrir();
  await p.waitForSelector(".pick .mk:text-matches('cartões')", {timeout: 15000});
  mk = await mercados(p);
  ok(mk.some(x => x === "Mais de 4.5 cartões"), "jogo pegado sai como mais de 4.5 cartões: " + mk.join(" | "));
  ok(/7\.0 cartões em média/.test(await porque(p, "Mais de 4.5 cartões")), "mostra a média de cartões");
  await p.context().close();

  setDet({"Flamengo": {y: [1, 1], ht: [1, 0]}, "Vasco da Gama": {y: [1, 1], ht: [1, 0]}});
  p = await abrir();
  await p.waitForSelector(".pick .mk:text-matches('cartões')", {timeout: 15000});
  mk = await mercados(p);
  ok(mk.some(x => x === "Menos de 4.5 cartões"), "jogo calmo sai como menos de 4.5 cartões: " + mk.join(" | "));
  await p.context().close();

  /* ---------- uma busca por jogo passado, e com cache nenhuma ---------- */
  setDet({});
  p = await abrir();
  await p.waitForSelector(".pick .mk:text-matches('1º tempo')", {timeout: 15000});
  const antes = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("iagc2:")).length);
  ok(antes >= 5, "guarda os detalhes de cada jogo passado no celular (" + antes + ")");
  await p.context().close();

  /* ---------- peso por competição ---------- */
  setDet({});
  p = await abrir();
  const f1 = await p.$$eval(".pick .pct", e => e.map(x => x.textContent));
  ok(f1.length > 0 && f1.every(x => /^\d+%$/.test(x)), "confiança continua saindo em % com o peso por competição");
  await p.context().close();

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
