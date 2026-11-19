/* Testa o proxy da Cloudflare sem subir nada: chama o worker direto,
   com um fetch de mentira no lugar da API-Football. */
const path = require("path"), fs = require("fs");
const ROOT = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../palpiteiro-repo")]
  .find(d => fs.existsSync(path.join(d, "ia", "index.html")));
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const APP = "https://opalpiteiro.online";

(async () => {
  const worker = (await import(path.join(ROOT, "proxy/worker.js"))).default;
  const env = {API_FOOTBALL_KEY: "chave-secreta-de-teste"};
  const ctx = {waitUntil: () => {}};
  const chamadas = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    chamadas.push({url: String(u), headers: (o && o.headers) || {}});
    if (String(u).includes("estoura")) return new Response("limite", {status: 429});
    return new Response(JSON.stringify({response: [{id: 1}]}), {status: 200, headers: {"content-type": "application/json"}});
  };
  const chamar = (caminho, origem = APP, metodo = "GET") =>
    worker.fetch(new Request("https://api.palpiteiro.workers.dev" + caminho,
      {method: metodo, headers: origem ? {Origin: origem} : {}}), env, ctx);

  /* ---------- a chave nunca sai daqui ---------- */
  let r = await chamar("/fixtures?date=2026-11-19&league=71");
  ok(r.status === 200, "pedido normal passa");
  const corpo = await r.text();
  ok(!corpo.includes("chave-secreta-de-teste"), "a resposta não devolve a chave");
  ok(!JSON.stringify([...r.headers]).includes("chave-secreta-de-teste"), "os cabeçalhos também não");
  ok(chamadas[0].headers["x-apisports-key"] === "chave-secreta-de-teste", "a chave é posta pelo proxy, não pelo app");
  ok(chamadas[0].url.startsWith("https://v3.football.api-sports.io/fixtures"), "chama a API certa: " + chamadas[0].url);
  ok(!chamadas[0].url.includes("Origin"), "não repassa a origem para a API");

  /* ---------- só o site pode chamar ---------- */
  for (const o of ["https://sitequalquer.com", "", "https://opalpiteiro.online.falso.com"]) {
    const x = await chamar("/fixtures?date=2026-11-19", o);
    ok(x.status === 403, "recusa chamada de " + (o || "origem nenhuma"));
  }
  ok((await chamar("/fixtures", "http://localhost:8080")).status === 200, "libera o computador de casa, para testar");

  /* ---------- só os caminhos liberados ---------- */
  ok((await chamar("/standings?league=71&season=2026")).status === 200, "tabela passa");
  ok((await chamar("/fixtures/headtohead?h2h=1-2")).status === 200, "confronto direto passa");
  for (const c of ["/users", "/status", "/qualquer", "/fixtures/secreto"]) {
    ok((await chamar(c)).status === 404, "recusa caminho não liberado: " + c);
  }

  /* ---------- método e preflight ---------- */
  ok((await chamar("/fixtures", APP, "POST")).status === 405, "só aceita GET");
  const pre = await chamar("/fixtures", APP, "OPTIONS");
  ok(pre.status === 204 && pre.headers.get("access-control-allow-origin") === APP, "preflight responde com o CORS certo");
  ok((await chamar("/fixtures", "https://sitequalquer.com", "OPTIONS")).status === 403, "preflight de fora é recusado");

  /* ---------- cota estourada vira recado claro ---------- */
  const q = await chamar("/fixtures?date=estoura");
  ok(q.status === 429 && /cota/i.test(await q.text()), "quando a cota acaba, o app recebe um recado claro");

  /* ---------- sem chave configurada ---------- */
  const semChave = await worker.fetch(new Request("https://x/fixtures", {headers: {Origin: APP}}), {}, ctx);
  ok(semChave.status === 500 && /sem a chave/.test(await semChave.text()), "sem a chave, avisa em vez de vazar erro da API");

  /* ---------- endereço de saúde, para a rotina conferir ---------- */
  const s = await worker.fetch(new Request("https://x/saude"), env, ctx);
  const sj = await s.json();
  ok(s.status === 200 && sj.ok === true && sj.chave === true, "o endereço de saúde diz se o proxy está de pé e com chave");
  const s2 = await worker.fetch(new Request("https://x/saude"), {}, ctx);
  ok((await s2.json()).chave === false, "e avisa quando está sem chave");

  /* ---------- nada de senha escrita no arquivo ---------- */
  const src = fs.readFileSync(path.join(ROOT, "proxy/worker.js"), "utf8");
  ok(!/x-apisports-key"\s*:\s*"[A-Za-z0-9]{10}/.test(src) && /env\.API_FOOTBALL_KEY/.test(src),
    "a chave vem do cofre da Cloudflare, não do código");
  const toml = fs.readFileSync(path.join(ROOT, "proxy/wrangler.toml"), "utf8");
  ok(!/API_FOOTBALL_KEY\s*=/.test(toml), "a chave também não está no arquivo de configuração");

  globalThis.fetch = realFetch;
  console.log("sem erros no console");
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0]); process.exit(1); });
