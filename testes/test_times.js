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
  if (u.pathname.includes("/team/")) { const slug = u.searchParams.get("slug"); const name = {flamengo: "Flamengo", palmeiras: "Palmeiras", gremio: "Gremio", internacional: "Internacional", bahia: "Bahia", "o-higgins": "O'Higgins", corinthians: "Corinthians", "sao-paulo": "Sao Paulo"}[slug] || slug; const next = slug === "flamengo" ? [{url: "/football/match/fla-next-2/", home: "Santos", away: "Flamengo", time: iso(24 * 6), status: "upcoming", home_score: null, away_score: null, competition: "Brasileirão"}, {url: "/football/match/fla-next-1/", home: "Flamengo", away: "Vasco da Gama", time: iso(24 * 2), status: "upcoming", home_score: null, away_score: null, competition: "Brasileirão"}] : []; return j({team: {name}, matches: [...[0, 1, 2, 3, 4, 5].map(i => past(name, i)), ...next]}); }
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
  await p.addInitScript(() => { try { if (!localStorage.getItem("pal-favs")) localStorage.setItem("pal-favs", "[]"); } catch (e) {} });
  await p.addInitScript(`try{localStorage.setItem("pal-bemvindo","1");}catch(e){}`);
  if (init) await p.addInitScript(init);
  p.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
  return p;
}
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const FS = "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

(async () => {
  await new Promise(r => srv.listen(8767, r));
  const B = "http://localhost:8767/ia/";
  const browser = await chromium.launch();
  const user = `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};window.__db={"users/u1":{status:"approved",name:"Ana",opens:1}};`;
  const favs = f => `try{localStorage.setItem("pal-favs", ${JSON.stringify(JSON.stringify(f))})}catch(e){}`;
  const F = [{slug: "flamengo", name: "Flamengo", logo: ""}, {slug: "gremio", name: "Gremio", logo: ""}, {slug: "liverpool", name: "Liverpool", logo: ""}];
  let p = await ctx(browser, {}, user + favs(F));
  await p.goto(B); await p.waitForSelector(".league");
  await p.click(".favbtn"); await p.waitForSelector(".nx");
  ok(/#times$/.test(p.url()), "botão Meus times abre a tela nova");
  const cards = p.locator(".league");
  ok(await cards.count() === 3, "um cartão por time favorito");
  const fla = await cards.nth(0).innerText();
  ok(/Flamengo/.test(fla) && fla.indexOf("Vasco") < fla.indexOf("Santos") && /Em casa/.test(fla) && /Fora/.test(fla), "Flamengo: próximos jogos em ordem, com casa/fora");
  ok(/18\/11/.test(fla) && /22\/11/.test(fla), "mostra o dia e a hora de cada jogo");
  const gre = await cards.nth(1).innerText();
  ok(/Internacional/.test(gre) && /Hoje/.test(gre) && /22:54/.test(gre), "Grêmio: achou o jogo de hoje pela lista de partidas");
  ok(/Nenhum jogo marcado/.test(await cards.nth(2).innerText()), "Liverpool: avisa que não tem jogo marcado");
  ok(await p.locator(".tplus").count() === 1, "botão + no topo");
  await p.screenshot({path: "shots/t1-meustimes.png"});
  await p.click(".tplus"); await p.waitForSelector(".fav-t.on");
  ok(await p.locator(".fav-t.on").count() === 3, "+ abre a lista com os times já marcados");
  await p.locator(".fav-t.on", {hasText: "Liverpool"}).click(); await p.locator(".fav-t", {hasText: "Corinthians"}).click(); await p.click("#fav-ok");
  await p.waitForFunction(() => document.querySelectorAll(".league").length === 3 && /Corinthians/.test(document.querySelector("#app").innerText));
  const txt = await p.innerText("#app");
  ok(/Corinthians/.test(txt) && !/Liverpool/.test(txt), "adicionar e remover atualiza a tela na hora");
  await p.locator(".nx", {hasText: "Vasco"}).click(); await p.waitForSelector(".hero");
  ok(/Flamengo/.test(await p.innerText(".hero")) && /Vasco/.test(await p.innerText(".hero")), "tocar no próximo jogo abre a análise dele");
  await p.waitForSelector(".row, .empty"); await p.screenshot({path: "shots/t2-jogo.png"});
  await p.goBack(); await p.waitForSelector(".nx"); ok(true, "voltar retorna para Meus times");
  await p.click(".tback"); await p.waitForSelector(".sbar"); ok(/Meus times/.test(await p.locator(".league").first().innerText()), "seta volta para as partidas");
  await p.context().close();
  // sem times
  p = await ctx(browser, {}, user + favs([]));
  await p.goto(B + "#times"); await p.waitForSelector(".bigadd");
  ok(/ainda não escolheu/.test(await p.innerText("#app")), "sem times: convida a adicionar");
  await p.screenshot({path: "shots/t3-vazio.png"});
  await p.click(".bigadd"); await p.waitForSelector(".fav-t"); await p.locator(".fav-t", {hasText: "Flamengo"}).click(); await p.click("#fav-ok");
  await p.waitForSelector(".nx"); ok(await p.locator(".league").count() === 1, "adicionar pelo botão grande funciona");
  await p.context().close();
  p = await ctx(browser, {...devices["iPhone SE"]}, user + favs(F));
  await p.goto(B + "#times"); await p.waitForSelector(".nx");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "celular pequeno sem rolagem lateral");
  await p.screenshot({path: "shots/t4-se.png"});
  await p.context().close();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
