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

const ADM2 = ADM;
const hexToRgb = h => `rgb(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)})`;
(async () => {
  await new Promise(r => srv.listen(8768, r));
  const B = "http://localhost:8768/ia/";
  const browser = await chromium.launch();
  const SLIP = [{id: "a", mk: "Mais de 2.5 gols", conf: 80, h: "Flamengo", a: "Vasco da Gama", hl: "", t: iso(3)},
                {id: "b", mk: "Ambas marcam: Sim", conf: 64, h: "Gremio", a: "Internacional", hl: "", t: iso(4)}];
  const dois = j => [{jogo: j + " 1", mercado: "Mais de 2.5"}, {jogo: j + " 2", mercado: "Ambas marcam: Sim"}];
  const TK = [{date: "2026-11-16", tipo: "Equilibrado", odd: "3.54", codigo: "X1", order: 1, sel: dois("A x B")},
              {date: "2026-11-16", tipo: "Muito arriscado", odd: "9.10", codigo: "X2", order: 4, sel: dois("C x D")},
              {date: "2026-11-16", tipo: "", odd: "1.45", codigo: "X3", order: 9, sel: dois("E x F")}];
  const user = `window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",opens:1}${TK.map((t, i) => `,"tickets/t${i}":${JSON.stringify(t)}`).join("")}};
    try{localStorage.setItem("pal-favs","[]");localStorage.setItem("iag-slip2",${JSON.stringify(JSON.stringify(SLIP))})}catch(e){}`;

  let p = await ctx(browser, {}, user);
  await p.goto(B); await p.waitForSelector(".league");
  // faixas de risco
  const faixas = await p.evaluate(() => [95, 78, 77, 70, 69, 62, 61, 50, 49, 20].map(n => risco(n).lbl));
  ok(faixas.join("|") === "Muito seguro|Muito seguro|Seguro|Seguro|Médio|Médio|Arriscado|Arriscado|Muito arriscado|Muito arriscado", "5 faixas na ordem certa: " + faixas.join(", "));
  const cores = await p.evaluate(() => RISCOS.map(r => r.c));
  ok(cores.join() === "#19e07a,#a8e05f,#ffd34d,#ff9a3d,#ff5a5a", "cores do verde ao vermelho");
  // palpites do jogo
  await p.locator(".match", {hasText: "Grêmio"}).click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites" }).click(); await p.waitForSelector(".pick, .empty");
  const n = await p.locator(".pick").count();
  const bad = await p.evaluate(() => [...document.querySelectorAll(".pick")].map(el => ({
    pct: +el.querySelector(".pct").textContent.replace("%", ""), lbl: el.querySelector(".rsk").textContent.trim(),
    cor: el.querySelector(".bar i").style.background, certo: risco(+el.querySelector(".pct").textContent.replace("%", "")).lbl === el.querySelector(".rsk").textContent.trim()
  })));
  const CORES = {"Muito seguro": "#19e07a", "Seguro": "#a8e05f", "Médio": "#ffd34d", "Arriscado": "#ff9a3d", "Muito arriscado": "#ff5a5a"};
  bad.forEach(b => b.ok = b.certo && b.cor.replace(/\s/g, "") === hexToRgb(CORES[b.lbl]));
  ok(n > 0 && bad.every(b => b.ok), `cada palpite tem o selo e a cor do seu risco (${bad.map(b => b.pct + "% " + b.lbl).join(", ")})`);
  ok(await p.locator(".risco-leg").count() === 1, "legenda das cores nos palpites");
  await p.screenshot({path: "shots/r1-palpites.png"});
  // bilhete
  await p.goto(B + "#bilhete"); await p.waitForSelector(".slip-rsk");
  const bt = await p.innerText("#app");
  ok(/Muito seguro · 80%/.test(bt) && /Médio · 64%/.test(bt), "cada seleção com seu nível");
  ok(/Chance de bater tudo/.test(bt) && /51%/.test(bt), "chance do bilhete inteiro (80% x 64% = 51%)");
  ok(/Arriscado/.test(await p.innerText(".slip-rsk")) && !/Muito arriscado/.test(await p.innerText(".slip-rsk")), "bilhete de 51% fica Arriscado");
  await p.screenshot({path: "shots/r2-bilhete.png"});
  // como o painel nomeia o risco de cada bilhete
  await p.goto(B); await p.waitForSelector(".league");
  const tags = await p.evaluate(() => [["Equilibrado", "3.54"], ["Muito arriscado", "9.10"], ["", "1.45"]]
    .map(([n, o]) => { const r = riscoNome(n, o); return {t: r.lbl, c: r.c}; }));
  ok(tags[0].t === "Médio" && tags[0].c === "#ffd34d", "nome antigo Equilibrado vira Médio amarelo");
  ok(tags[1].t === "Muito arriscado" && tags[1].c === "#ff5a5a", "Muito arriscado fica vermelho");
  ok(tags[2].t === "Muito seguro" && tags[2].c === "#19e07a", "sem nome: odd 1.45 vira Muito seguro verde");
  await p.context().close();

  // painel
  const admInit = `window.__user={uid:"adm",email:${JSON.stringify(ADM2)},displayName:"Admin",providerData:[]};
    window.__db={"users/c":{status:"approved",name:"Ana",email:"a@teste.local",createdAt:{toMillis:()=>Date.now()},lastSeen:{toMillis:()=>Date.now()}}${TK.map((t, i) => `,"tickets/t${i}":${JSON.stringify(t)}`).join("")}};`;
  p = await ctx(browser, {viewport: {width: 1100, height: 900}, isMobile: false, hasTouch: false, deviceScaleFactor: 1}, admInit);
  await p.goto(B + "admin/"); await p.waitForSelector(".stats");
  await p.click("[data-tab=tk]"); await p.waitForSelector(".tk");
  const lst = await p.$$eval(".tk .rsk", e => e.map(x => x.textContent.trim()));
  ok(lst.join("|") === "Médio|Muito arriscado|Muito seguro", "painel pinta os bilhetes: " + lst.join(", "));
  await p.screenshot({path: "shots/r4-admin-lista.png"});
  await p.click("#tk-new"); await p.waitForSelector("#t-tipo");
  const ops = await p.$$eval("#t-tipo option", e => e.map(x => x.textContent));
  ok(ops.slice(0, 5).join("|") === "Muito seguro|Seguro|Médio|Arriscado|Muito arriscado", "5 opções no painel: " + ops.slice(0, 5).join(", "));
  await p.fill("#t-odd", "6,20"); await p.waitForSelector("#t-sug:not([hidden])");
  ok(/Arriscado/.test(await p.innerText("#t-sug")) && await p.inputValue("#t-tipo") === "Arriscado", "odd 6,20 sugere e marca Arriscado sozinho");
  await p.selectOption("#t-tipo", "Seguro"); await p.waitForTimeout(100);
  ok(/costuma ser/.test(await p.innerText("#t-sug")) && await p.inputValue("#t-tipo") === "Seguro", "mudando na mão, só sugere");
  await p.fill("#t-odd", "9,5"); await p.waitForTimeout(100);
  ok(await p.inputValue("#t-tipo") === "Seguro", "não troca o que o admin já escolheu");
  await p.click("#t-usar"); ok(await p.inputValue("#t-tipo") === "Muito arriscado", "botão Usar esse aplica a sugestão");
  await p.screenshot({path: "shots/r5-admin-form.png"});
  const rows = p.locator(".selrow"); await rows.nth(0).locator("input").nth(0).fill("A x B"); await rows.nth(0).locator("input").nth(2).fill("Vitória do A");
  await p.fill("#t-cod", "ZZ9"); await p.click("#t-save"); await p.waitForTimeout(400);
  const novo = await p.evaluate(() => Object.entries(window.__db).filter(([k]) => k.startsWith("tickets/")).map(([, v]) => v).find(v => v.codigo === "ZZ9"));
  ok(novo && novo.tipo === "Muito arriscado" && novo.order === 4, "bilhete salvo com o nível e a ordem certos");
  await p.context().close();
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
