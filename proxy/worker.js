/* Proxy do Palpiteiro na Cloudflare.
   Existe por um motivo só: a API-Football exige chave em toda chamada, e o
   app é um site estático — o código roda no celular da pessoa. Se a chave
   fosse para lá, qualquer um abriria o app, leria a chave e gastaria a cota.
   Então a chave fica aqui dentro, onde ninguém vê, e o app fala com isto.

   De quebra, isto guarda as respostas por um tempo: a mesma tabela pedida
   por cem pessoas gasta uma consulta só da sua cota, não cem. */

const API = "https://v3.football.api-sports.io";

// De onde o app pode chamar. Qualquer outro endereço leva não.
const ORIGENS = [
  "https://opalpiteiro.online",
  "https://www.opalpiteiro.online",
  "https://duras999.github.io"
];
const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/* Só estes caminhos passam. Tudo que não está aqui é recusado, para
   ninguém usar o seu proxy para outra coisa. */
const CAMINHOS = new Set([
  "/fixtures", "/fixtures/headtohead", "/fixtures/statistics", "/fixtures/events",
  "/fixtures/lineups", "/standings", "/teams", "/teams/statistics",
  "/leagues", "/players/squads", "/injuries", "/predictions", "/odds"
]);

/* Por quanto tempo guardar cada tipo de resposta, em segundos.
   Jogo ao vivo muda a toda hora; tabela e elenco, quase nunca. */
const GUARDAR = [
  [/^\/fixtures$/, q => q.get("live") || q.get("status") === "LIVE" ? 60 : 600],
  [/^\/fixtures\/(events|statistics|lineups)$/, () => 300],
  [/^\/fixtures\/headtohead$/, () => 21600],
  [/^\/standings$/, () => 3600],
  [/^\/teams(\/statistics)?$/, () => 21600],
  [/^\/leagues$/, () => 86400],
  [/^\/players\/squads$/, () => 43200],
  [/^\/injuries$/, () => 1800],
  [/^\/(predictions|odds)$/, () => 900]
];
const segundos = (caminho, q) => {
  for (const [re, f] of GUARDAR) if (re.test(caminho)) return f(q);
  return 600;
};

const corsDe = origem => ({
  "access-control-allow-origin": origem,
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  "vary": "Origin"
});
const origemOk = o => !!o && (ORIGENS.includes(o) || ORIGEM_LOCAL.test(o));

const erro = (status, texto, origem) => new Response(
  JSON.stringify({erro: texto}),
  {status, headers: {"content-type": "application/json; charset=utf-8", ...(origem ? corsDe(origem) : {})}}
);

export default {
  async fetch(req, env, ctx) {
    const origem = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      if (!origemOk(origem)) return erro(403, "origem não autorizada");
      return new Response(null, {status: 204, headers: corsDe(origem)});
    }
    if (req.method !== "GET") return erro(405, "só GET por aqui", origemOk(origem) ? origem : "");

    // Um endereço simples para a rotina saber se o proxy está vivo.
    if (url.pathname === "/saude") {
      return new Response(JSON.stringify({ok: true, chave: !!env.API_FOOTBALL_KEY}),
        {status: 200, headers: {"content-type": "application/json", "cache-control": "no-store"}});
    }

    if (!origemOk(origem)) return erro(403, "origem não autorizada");
    const caminho = url.pathname.replace(/\/+$/, "") || "/";
    if (!CAMINHOS.has(caminho)) return erro(404, "caminho não liberado: " + caminho, origem);
    if (!env.API_FOOTBALL_KEY) return erro(500, "o proxy está sem a chave da API", origem);

    // a chave do cache não leva a origem: a mesma resposta serve para todos
    const limpa = new URL(API + caminho);
    [...url.searchParams.entries()].sort().forEach(([k, v]) => limpa.searchParams.append(k, v));
    const chaveCache = new Request(limpa.toString(), {method: "GET"});
    const cache = (typeof caches !== "undefined" && caches.default) || null;

    if (cache) {
      const guardada = await cache.match(chaveCache);
      if (guardada) {
        const r = new Response(guardada.body, guardada);
        Object.entries(corsDe(origem)).forEach(([k, v]) => r.headers.set(k, v));
        r.headers.set("x-pal-cache", "acertou");
        return r;
      }
    }

    let resp;
    try {
      resp = await fetch(limpa.toString(), {headers: {"x-apisports-key": env.API_FOOTBALL_KEY}});
    } catch (e) {
      return erro(502, "a API não respondeu", origem);
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return erro(resp.status === 429 ? 429 : 502,
        resp.status === 429 ? "cota da API esgotada por hoje" : "a API respondeu " + resp.status + " " + t.slice(0, 120), origem);
    }

    const ttl = segundos(caminho, url.searchParams);
    const corpo = await resp.text();
    const guardar = new Response(corpo, {
      status: 200,
      headers: {"content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${ttl}`}
    });
    if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(chaveCache, guardar.clone()));

    const saida = new Response(corpo, {
      status: 200,
      headers: {"content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${ttl}`,
                "x-pal-cache": "buscou", ...corsDe(origem)}
    });
    return saida;
  }
};
