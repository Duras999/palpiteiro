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
const NOW = new Date("2026-11-18T15:00:00Z");           // 12:00 de 18/11 em Brasília
const iso = h => new Date(NOW.getTime() + h * 3600000).toISOString().replace(".000Z", "Z");
const sl = n => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// times com perfis bem diferentes em casa e fora
const PERFIL = {
  "Flamengo":      {casa: [[3,0],[2,0],[2,1],[1,0],[4,1]], fora: [[0,2],[1,1],[0,1],[1,2],[0,0]], pts: 62, j: 30, pos: 1},
  "Vasco da Gama": {casa: [[1,1],[0,1],[2,2],[1,0],[1,1]], fora: [[0,3],[1,2],[0,2],[1,1],[0,1]], pts: 30, j: 30, pos: 15},
  "Gremio":        {casa: [[2,2],[3,1],[1,1],[2,3],[2,1]], fora: [[1,2],[2,2],[1,3],[0,1],[2,2]], pts: 42, j: 30, pos: 8},
  "Internacional": {casa: [[1,0],[2,1],[1,1],[0,0],[2,0]], fora: [[1,1],[0,1],[1,0],[0,2],[1,1]], pts: 45, j: 30, pos: 6},
  "Palmeiras":     {casa: [[2,0],[1,0],[3,1],[2,1],[1,1]], fora: [[1,1],[2,1],[0,0],[1,0],[1,2]], pts: 58, j: 30, pos: 2}
};
const NOMES = Object.keys(PERFIL);
const past = (name, i) => {
  const p = PERFIL[name] || {casa: [[1,1]], fora: [[1,1]]};
  const emCasa = i % 2 === 0, arr = emCasa ? p.casa : p.fora;
  const [gf, ga] = arr[Math.floor(i / 2) % arr.length];
  return {url: `/football/match/old-${sl(name)}-${i}/`, home: emCasa ? name : "Rival " + i, away: emCasa ? "Rival " + i : name,
    time: iso(-24 * 7 * (i + 1)), status: "finished", home_score: emCasa ? gf : ga, away_score: emCasa ? ga : gf};
};
const M = (id, home, away, h, status, hs, as) => ({url: `/football/match/${id}/`, home, away, home_logo: "", away_logo: "",
  time: iso(h), status, status_text: status === "live" ? "67'" : status, home_score: hs, away_score: as, competition: "Liga"});
const NOMES_COMP = {"brazilian-serie-a": "Brazilian Serie A", "english-premier-league": "English Premier League",
  "copa-br": "Brazilian Copa do Brasil", "myanmar-u20": "Myanmar U20 League"};
let B_extras = {};
const fixtures = {
  "brazilian-serie-a": [
    M("fla-vas", "Flamengo", "Vasco da Gama", 9, "upcoming", null, null),
    M("gre-int", "Gremio", "Internacional", 7, "upcoming", null, null),
    M("pal-cor", "Palmeiras", "Corinthians", -3, "finished", 2, 1)],
  "english-premier-league": [M("ars-che", "Arsenal", "Chelsea", 8, "upcoming", null, null)],
};
// campeonatos extras que um teste específico liga quando precisa
B_extras = {"copa-br": [M("fla-san-cb", "Flamengo", "Santos", 6, "upcoming", null, null)],
            "myanmar-u20": [M("mya-1", "Yangon U20", "Mandalay U20", 5, "upcoming", null, null)]};
const H2H = {matches: [0,1,2,3,4].map(i => ({home: i % 2 ? "Vasco da Gama" : "Flamengo", away: i % 2 ? "Flamengo" : "Vasco da Gama",
  home_score: i % 2 ? 0 : 3, away_score: i % 2 ? 2 : 1, time: iso(-24 * 120 * (i + 1))}))};
// cartões por lado e placar do 1o tempo dos jogos passados; um teste pode trocar
const DET = {"*": {y: [2, 2], ht: [1, 0]}};
const reqs = [];
async function api(route) {
  const u = new URL(route.request().url()); reqs.push(u.pathname + u.search);
  const j = o => route.fulfill({status: 200, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: JSON.stringify(o)});
  if (u.pathname.includes("/fixtures/")) {
    const c = u.searchParams.get("competition");
    const all = c ? (fixtures[c] || []) : Object.entries(fixtures).flatMap(([k, v]) => v.map(m => ({...m, competition: NOMES_COMP[k] || k})));
    return j({matches: all.filter(m => m.time.slice(0, 10) === u.searchParams.get("date"))});
  }
  if (u.pathname.includes("/team/")) { const slug = u.searchParams.get("slug");
    const name = NOMES.find(n => sl(n) === slug); if (!name) return j({});
    return j({team: {name}, matches: [0,1,2,3,4,5,6,7,8,9].map(i => past(name, i))}); }
  if (u.pathname.includes("/h2h/")) { const t = (u.searchParams.get("team1") || "") + (u.searchParams.get("team2") || "");
    return j(/flamengo/.test(t) && /vasco/.test(t) ? H2H : {matches: []}); }
  if (u.pathname.includes("/standings/")) { const c = u.searchParams.get("competition");
    const T = c === "brazilian-serie-a" ? ["Flamengo","Palmeiras","Internacional","Gremio","Vasco da Gama","Corinthians","Cruzeiro","Bahia"]
      : c === "english-premier-league" ? ["Arsenal","Chelsea","Liverpool"] : [];
    return j({tables: [{rows: T.map((t, i) => { const p = PERFIL[t];
      return {pos: p ? p.pos : i + 1, team: t, team_slug: sl(t), team_logo: "", p: p ? p.j : 30, w: 10, d: 5, l: 5, gd: 5, pts: p ? p.pts : 35}; })}]}); }
  if (u.pathname.includes("/match/")) {
    const slug = u.searchParams.get("slug") || "";
    const om = /^old-(.+)-(\d+)$/.exec(slug);
    if (om) {   // jogo passado: cartões e placar do primeiro tempo
      const name = NOMES.find(n => sl(n) === om[1]);
      if (!name) return j({match: null});
      const x = past(name, +om[2]), d = DET[name] || DET["*"];
      const cards = [];
      for (let k = 0; k < d.y[0]; k++) cards.push({is_card: true, side: "home", type: "yellow_card"});
      for (let k = 0; k < d.y[1]; k++) cards.push({is_card: true, side: "away", type: "yellow_card"});
      return j({match: {...x, incidents: cards, home_ht_score: d.ht[0], away_ht_score: d.ht[1]}});
    }
    const todos = Object.values(fixtures).flat();
    const m = todos.find(x => (x.url || "").includes("/" + slug + "/"));
    return j({match: m || null});
  }
  return j({});
}
const errors = [];
async function ctx(browser, opts, init) {
  const c = await browser.newContext({...devices["Pixel 7"], ...opts, serviceWorkers: "block", timezoneId: "Europe/London", acceptDownloads: true});
  await c.route("https://sportscore.com/**", api);
  await c.route("https://www.gstatic.com/firebasejs/**", r => { const u = r.request().url();
    const b = u.includes("firebase-app") ? stubs.app : u.includes("firebase-auth") ? stubs.auth
            : u.includes("firebase-messaging") ? stubs.msg : stubs.fs;
    r.fulfill({status: 200, contentType: "text/javascript", headers: {"access-control-allow-origin": "*"}, body: b}); });
  await c.route("https://fonts.googleapis.com/**", r => r.fulfill({status: 200, contentType: "text/css", body: ""}));
  const p = await c.newPage();
  await p.clock.install({time: NOW});
  // por padrão o tour de boas-vindas já foi visto; quem quiser testá-lo apaga a marca
  await p.addInitScript(`try{localStorage.setItem("pal-bemvindo","1");}catch(e){}`);
  if (init) await p.addInitScript(init);
  p.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push("CONSOLE " + m.text()); });
  return p;
}
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
module.exports = {chromium, devices, srv, ROOT, ADM, NOW, iso, ctx, ok, errors, fixtures, PERFIL, sl, fs,
  DET, setDet: o => { Object.keys(DET).forEach(k => { if (k !== "*") delete DET[k]; }); Object.assign(DET, o); },
  addLiga: (nome, lista) => { fixtures[nome] = lista; },
  tirarLiga: nome => { delete fixtures[nome]; },
  jogo: (id, home, away, h, status, hs, as) => M(id, home, away, h, status, hs, as),
  ligarExtras: () => Object.assign(fixtures, B_extras),
  desligarExtras: () => Object.keys(B_extras).forEach(k => delete fixtures[k])};
