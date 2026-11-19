const { chromium, devices } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const stubs = require("./stubs.js");
// a suíte roda tanto dentro do repositório quanto na pasta de trabalho aqui
const ROOT = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../palpiteiro-repo")]
  .find(d => fs.existsSync(path.join(d, "ia", "index.html")));
if (!ROOT) throw new Error("não achei a pasta ia/ do app");
const ADM = /ADMINS = \["([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "ia/firebase-config.js"), "utf8"))[1];
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".css": "text/css"};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {"content-type": types[path.extname(f)] || "application/octet-stream"}); r.end(fs.readFileSync(f)); });
const NOW = new Date("2026-11-17T01:30:00Z"); // 22:30 de 16/11 em Brasília
const iso = (h) => new Date(NOW.getTime() + h * 3600000).toISOString().replace(".000Z", "Z");
const M = (id, home, away, h, status, hs, as) => ({url: `/football/match/${id}/`, home, away, home_logo: "", away_logo: "", time: iso(h), status, status_text: status === "live" ? "67'" : status, home_score: hs, away_score: as, competition: "Liga"});
const fixtures = {
  "brazilian-serie-a": [M("fla-pal-1", "Flamengo", "Palmeiras", -6, "finished", 2, 1), M("cor-sao-2", "Corinthians", "Sao Paulo", -1, "live", 1, 1), M("gre-int-3", "Gremio", "Internacional", 0.4, "upcoming", null, null), M("bah-o-4", "Bahia", "O'Higgins", 20, "upcoming", null, null)],
  "english-premier-league": [M("ars-che-5", "Arsenal", "Chelsea", -8, "finished", 0, 0)]
};
const reqs = [];
const past = (name, i) => { const gf = [2, 1, 3, 0, 2, 1][i], ga = [1, 1, 2, 0, 0, 2][i]; return {url: `/football/match/old-${name}-${i}/`, home: name, away: "Rival " + i, time: iso(-24 * 7 * (i + 1)), status: "finished", home_score: gf, away_score: ga}; };
async function api(route) {
  const u = new URL(route.request().url()); reqs.push(u.pathname + u.search);
  const j = o => route.fulfill({status: 200, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: JSON.stringify(o)});
  if (u.pathname.includes("/fixtures/")) { const all = fixtures[u.searchParams.get("competition")] || []; return j({matches: all.filter(m => m.time.slice(0, 10) === u.searchParams.get("date"))}); }
  if (u.pathname.includes("/team/")) { const slug = u.searchParams.get("slug"); const name = {flamengo: "Flamengo", palmeiras: "Palmeiras", gremio: "Gremio", internacional: "Internacional", bahia: "Bahia", "o-higgins": "O'Higgins", corinthians: "Corinthians", "sao-paulo": "Sao Paulo"}[slug] || slug; return j({team: {name}, matches: [0, 1, 2, 3, 4, 5].map(i => past(name, i))}); }
  if (u.pathname.includes("/h2h/")) return j({summary: {team1_wins: 3, draws: 2, team2_wins: 1}, matches: [past("Gremio", 0)]});
  if (u.pathname.includes("/standings/")) {
    const c = u.searchParams.get("competition");
    const T = {"brazilian-serie-a": ["Flamengo","Palmeiras","Corinthians","Sao Paulo","Gremio","Internacional","Bahia","Atletico Mineiro","Vasco da Gama","Botafogo","Fluminense","Cruzeiro"],
      "brazilian-serie-b": ["Goias","Sport Club do Recife","Criciuma","Gremio Novorizontino"], "english-premier-league": ["Arsenal","Chelsea","Liverpool"], "conmebol-copa-libertadores": ["Flamengo","O'Higgins"]}[c] || [];
    return j({tables: [{rows: T.map((t, i) => ({pos: i + 1, team: t, team_slug: t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), team_logo: "", p: 30, w: 10, d: 5, l: 5, gd: 2, pts: 35}))}]});
  }
  if (u.pathname.includes("/match/")) return j({match: null});
  return j({});
}
const errors = [];
async function ctx(browser, opts, init) {
  const c = await browser.newContext({...devices["Pixel 7"], ...opts, serviceWorkers: "block", timezoneId: "Europe/London", acceptDownloads: true});
  await c.route("https://sportscore.com/**", api);
  await c.route("https://www.gstatic.com/firebasejs/**", r => { const u = r.request().url(); const b = u.includes("firebase-app") ? stubs.app : u.includes("firebase-auth") ? stubs.auth : stubs.fs; r.fulfill({status: 200, contentType: "text/javascript", headers: {"access-control-allow-origin": "*"}, body: b}); });
  await c.route("https://fonts.googleapis.com/**", r => r.fulfill({status: 200, contentType: "text/css", body: ""}));
  const p = await c.newPage();
  await p.clock.install({time: NOW});
  await p.addInitScript(`try{localStorage.setItem("pal-bemvindo","1");}catch(e){}`);
  if (init) await p.addInitScript(init);
  p.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
  return p;
}
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const FS = "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

(async () => {
  await new Promise(r => srv.listen(8766, r));
  const B = "http://localhost:8766/ia/";
  const browser = await chromium.launch();
  const user = `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};window.__db={"users/u1":{status:"approved",name:"Ana",opens:1}};`;
  let p = await ctx(browser, {}, user);
  await p.goto(B); await p.waitForSelector(".league");
  await p.waitForSelector("#fav:not([hidden]) .fav-t", {timeout: 8000});
  ok(/Quais times você acompanha/.test(await p.innerText("#fav")), "primeira vez: pergunta os times");
  const ligas = await p.$$eval(".fav-lg", e => e.map(x => x.textContent));
  ok(ligas[0] === "Brasileirão Série A" && ligas.length === 4, "times separados por campeonato: " + ligas.join(", "));
  ok(await p.locator(".fav-t", {hasText: "Flamengo"}).count() === 1, "Flamengo aparece uma vez só (sem repetir na Libertadores)");
  await p.screenshot({path: "shots/f1-escolha.png"});
  await p.locator(".fav-t", {hasText: "Grêmio"}).click();
  await p.fill("#fav-q", "flam"); ok(await p.locator(".fav-t").count() === 1, "busca de time dentro da escolha");
  await p.locator(".fav-t", {hasText: "Flamengo"}).click();
  await p.fill("#fav-q", "");
  ok(await p.locator(".fav-t.on").count() === 2 && /Salvar 2 times/.test(await p.innerText("#fav-ok")), "marcou 2 times");
  await p.screenshot({path: "shots/f2-marcados.png"});
  await p.click("#fav-ok"); await p.waitForTimeout(300);
  ok(await p.locator("#fav").isHidden(), "salvou e fechou");
  const bloco = p.locator(".league").first();
  const bt = await bloco.innerText();
  ok(/Meus times/.test(bt) && /Flamengo/.test(bt) && /Grêmio/.test(bt) && !/Corinthians/.test(bt), "bloco Meus times no topo com os jogos dos favoritos");
  ok(await p.locator(".favbtn.on").count() === 1, "botão Meus times ao lado da busca (marcado)");
  const w = await p.evaluate(() => ({s: document.querySelector(".sbar .search").getBoundingClientRect(), b: document.querySelector(".favbtn").getBoundingClientRect(), vw: innerWidth, sw: document.documentElement.scrollWidth}));
  ok(Math.abs(w.s.top - w.b.top) < 2 && w.b.right <= w.vw - 15 && w.sw <= w.vw, `busca e botão na mesma linha (busca ${Math.round(w.s.width)}px, botão ${Math.round(w.b.width)}px)`);
  await p.screenshot({path: "shots/f3-home.png"});
  await p.reload(); await p.waitForSelector(".league"); await p.waitForTimeout(2500);
  ok(await p.locator("#fav").count() === 0 || await p.locator("#fav").isHidden(), "não pergunta de novo depois de escolher");
  ok(/Meus times/.test(await p.locator(".league").first().innerText()), "favoritos continuam salvos depois de recarregar");
  await p.click(".favbtn"); await p.click(".tplus"); await p.waitForSelector(".fav-t.on");
  ok(/^Meus times/.test(await p.innerText("#fav h2")) && await p.locator(".fav-t.on").count() === 2, "abrir pelo botão mostra os já escolhidos");
  await p.locator(".fav-t.on", {hasText: "Grêmio"}).click(); await p.locator(".fav-t.on", {hasText: "Flamengo"}).click(); await p.click("#fav-ok");
  await p.waitForTimeout(200); await p.click(".tback"); await p.waitForSelector(".sbar");
  ok(!/Meus times/.test(await p.locator(".league").first().innerText()) && await p.locator(".favbtn.on").count() === 0, "desmarcar todos tira o bloco");
  // dia sem jogo dos favoritos
  await p.click(".favbtn"); await p.click(".tplus"); await p.waitForSelector(".fav-t"); await p.locator(".fav-t", {hasText: "Liverpool"}).click(); await p.click("#fav-ok"); await p.waitForTimeout(400); await p.click(".tback"); await p.waitForSelector(".sbar");
  ok(/Seus times não jogam hoje/.test(await p.innerText("#app")), "aviso quando os favoritos não jogam");
  await p.screenshot({path: "shots/f4-semjogo.png"});
  await p.context().close();
  // pular
  p = await ctx(browser, {}, user);
  await p.goto(B); await p.waitForSelector("#fav:not([hidden]) .fav-t");
  await p.click("#fav-skip"); await p.waitForTimeout(200);
  ok(await p.locator("#fav").isHidden(), "Pular fecha");
  await p.reload(); await p.waitForSelector(".league"); await p.waitForTimeout(2500);
  ok(await p.locator("#fav").count() === 0, "depois de pular não pergunta de novo");
  ok(await p.locator(".favbtn").count() === 1, "botão continua lá para escolher depois");
  await p.context().close();
  // não aparece antes do login
  p = await ctx(browser, {});
  await p.goto(B); await p.waitForSelector("#g-enter"); await p.waitForTimeout(2500);
  ok(await p.locator("#fav").count() === 0, "não aparece na tela de login");
  await p.context().close();
  // celular pequeno
  p = await ctx(browser, {...devices["iPhone SE"]}, user);
  await p.goto(B); await p.waitForSelector("#fav:not([hidden]) .fav-t"); await p.click("#fav-skip");
  const w2 = await p.evaluate(() => ({b: document.querySelector(".favbtn").getBoundingClientRect().right, s: document.querySelector(".sbar .search").getBoundingClientRect().width, vw: innerWidth, sw: document.documentElement.scrollWidth}));
  ok(w2.b <= w2.vw - 15 && w2.sw <= w2.vw && w2.s > 150, `celular pequeno: cabe (busca ${Math.round(w2.s)}px)`);
  await p.screenshot({path: "shots/f5-iphonese.png"});
  await p.context().close();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
