const B = require("./base.js");
const {chromium, devices, srv, ctx, ok, errors, iso, fs} = B;
const PORT = 8770, URL = `http://localhost:${PORT}/ia/`;
const hoje = "2026-11-18";
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const conta = (extra = "{}", favs = null, slip = null) => `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana Souza",providerData:[]};
    window.__db={"users/u1":Object.assign({status:"approved",name:"Ana Souza",opens:1},${extra})};
    try{${favs ? `localStorage.setItem("pal-favs",${JSON.stringify(JSON.stringify(favs))});` : ""}
        ${slip ? `localStorage.setItem("iag-slip2",${JSON.stringify(JSON.stringify(slip))});` : ""}}catch(e){}`;

  /* ---------- MOTOR DE PALPITES ---------- */
  let p = await ctx(browser, {}, conta("{}", []));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".row, .empty");
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick, .empty");
  const picks = await p.$$eval(".pick", e => e.map(x => ({mk: x.querySelector(".mk").textContent, why: x.querySelector(".why").textContent, conf: +x.querySelector(".pct").textContent.replace("%","")})));
  ok(picks.length > 0 && /Flamengo/.test(picks[0].mk) && picks.some(x => x.mk === "Vitória do Flamengo"),
    "favorece o mandante forte em casa: " + picks.map(x => x.mk + " " + x.conf + "%").join(" | "));
  ok(picks.some(x => /jogos em casa/.test(x.why)) && picks.some(x => /jogos fora/.test(x.why)), "o porquê separa casa e fora");
  ok(picks.some(x => /confrontos diretos/.test(x.why)), "o porquê cita o confronto direto");
  ok(picks.some(x => /Na tabela/.test(x.why)), "o porquê cita a posição na tabela");
  const eng = await p.evaluate(() => {
    const H = analysis["fla-vas"].H, A = analysis["fla-vas"].A;
    const casa = venueStats(H.res, true), fora = venueStats(H.res, false);
    return {base: H.res.length, seq: H.res6.length, casaPpg: +casa.ppg.toFixed(2), foraPpg: +fora.ppg.toFixed(2),
      usaMando: casa.usaMando, h2h: h2hStats(analysis["fla-vas"].h2h, "Flamengo"),
      tab: tableStats(analysis["fla-vas"].table, H.slug, "Flamengo")};
  });
  ok(eng.base === 10 && eng.seq === 6, "base de 10 jogos no motor e 6 nas sequências");
  ok(eng.usaMando && eng.casaPpg > eng.foraPpg + 1, `mando separado: ${eng.casaPpg} em casa x ${eng.foraPpg} fora`);
  ok(eng.h2h && eng.h2h.n === 5 && eng.h2h.hw === 5 && eng.h2h.aw === 0, "confronto direto lido: " + JSON.stringify({n: eng.h2h.n, vitorias: eng.h2h.hw}));
  ok(eng.tab && Math.abs(eng.tab.ppg - 62 / 30) < 0.01 && eng.tab.pos === 1, "tabela lida: " + eng.tab.ppg.toFixed(2) + " ppg");
  const rec = await p.evaluate(() => {
    const novo = wstats([{gf:3,ga:0,r:"V"},{gf:0,ga:3,r:"D"}]), velho = wstats([{gf:0,ga:3,r:"D"},{gf:3,ga:0,r:"V"}]);
    return {novo: +novo.ppg.toFixed(2), velho: +velho.ppg.toFixed(2)};
  });
  ok(rec.novo > rec.velho, `jogo mais recente pesa mais (${rec.novo} x ${rec.velho})`);
  // botão "Ver odd" em cada palpite
  const odds = await p.$$eval(".pick .odd-b", e => e.map(x => ({t: x.textContent.trim(), h: x.getAttribute("href"), tgt: x.getAttribute("target"), rel: x.getAttribute("rel")})));
  ok(odds.length === picks.length && odds.every(o => /Ver odd/.test(o.t)), "cada palpite tem o botão Ver odd");
  ok(odds.every(o => o.h === "https://www.bingoemcasa17.com/pt-BR/sportsbook" && o.tgt === "_blank" && /noopener/.test(o.rel)), "botão abre a Bingo em aba nova: " + odds[0].h);
  ok(await p.locator(".pick .add").first().innerText() === "+ Bilhete", "botão do bilhete encurtado para caber ao lado");
  ok(/Os botões de odd abrem a casa de apostas/.test(await p.innerText(".box")), "explicação de onde vem a odd");
  const linha = await p.evaluate(() => { const a = document.querySelector(".pick .pick-a"); const b = a.children[0].getBoundingClientRect(), c = a.children[1].getBoundingClientRect();
    return {mesmaLinha: Math.abs(b.top - c.top) < 2, cabe: document.documentElement.scrollWidth <= innerWidth}; });
  ok(linha.mesmaLinha && linha.cabe, "os dois botões lado a lado, sem estourar a tela");
  // com o modelo de link preenchido, vira link direto do jogo
  const direto = await p.evaluate(() => { const m = games["fla-vas"];
    return "https://x.test/sb?search={q}".replace("{q}", encodeURIComponent(short(m.home) + " " + short(m.away))); });
  ok(direto === "https://x.test/sb?search=Flamengo%20Vasco", "modelo de link monta a busca pelos times: " + direto);
  await p.locator(".tab", {hasText: "Sequências"}).click(); await p.waitForSelector(".wp");
  const w = await p.evaluate(() => winProb(analysis["fla-vas"].H, analysis["fla-vas"].A, games["fla-vas"], analysis["fla-vas"].table));
  ok(w.h + w.d + w.a === 100 && w.h > w.a + 25, `chance de vitória: ${w.h}/${w.d}/${w.a}`);
  await p.screenshot({path: "shots/n1-palpites.png"});
  await p.context().close();

  /* ---------- DESFALQUES ---------- */
  p = await ctx(browser, {}, conta("{}", []) + `window.__db["desfalques/flamengo"]={time:"Flamengo",slug:"flamengo",lista:[{nome:"Pedro",motivo:"lesão"},{nome:"Léo Pereira",motivo:"suspenso"}]};`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".match", {hasText: "Flamengo"}).first().click(); await p.waitForSelector(".dq, .empty");
  const dq = await p.innerText(".box:has(.dq)");
  ok(/Desfalques/.test(dq) && /Pedro/.test(dq) && /lesão/.test(dq) && /Léo Pereira/.test(dq), "caixa de desfalques na tela do jogo");
  await p.screenshot({path: "shots/n2-desfalques.png"});
  await p.locator(".tab", {hasText: "Palpites"}).click(); await p.waitForSelector(".pick, .empty");
  ok(await p.locator(".dq-av").count() === 1, "aviso de desfalque na aba de palpites");
  await p.context().close();

  /* ---------- CONTA: favoritos e bilhete ---------- */
  const SLIP = [{id: "fla-vas", mk: "Vitória do Flamengo", conf: 76, h: "Flamengo", a: "Vasco da Gama", hl: "", t: iso(9)}];
  p = await ctx(browser, {}, conta("{}", [{slug: "gremio", name: "Gremio", logo: ""}], SLIP));
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(600);
  const subiu = await p.evaluate(() => window.__db["users/u1"]);
  ok(Array.isArray(subiu.favs) && subiu.favs[0].slug === "gremio" && Array.isArray(subiu.slip) && subiu.slip.length === 1,
    "o que estava no celular sobe para a conta");
  await p.context().close();
  p = await ctx(browser, {}, conta(`{favs:[{slug:"palmeiras",name:"Palmeiras",logo:""}],slip:[{id:"gre-int",mk:"Ambas marcam: Sim",conf:70,h:"Gremio",a:"Internacional",hl:"",t:"${iso(7)}"}]}`));
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(700);
  ok(/Meus times/.test(await p.innerText("#app")) && /Palmeiras/.test(await p.evaluate(() => localStorage.getItem("pal-favs"))),
    "aparelho novo recebe os favoritos da conta");
  await p.goto(URL + "#bilhete"); await p.waitForSelector(".slip-item");
  ok(/Ambas marcam/.test(await p.innerText("#app")), "aparelho novo recebe o bilhete da conta");
  await p.context().close();

  /* ---------- SEQUÊNCIA DE DIAS + RESUMO ---------- */
  p = await ctx(browser, {}, conta(`{streak:4,lastDay:"2026-11-17",favs:[{slug:"flamengo",name:"Flamengo",logo:""}]}`));
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(500);
  ok(/🔥 5/.test(await p.innerText(".brandrow")), "sequência sobe de 4 para 5 ao abrir no dia seguinte");
  ok(await p.evaluate(() => window.__db["users/u1"].streak) === 5 && await p.evaluate(() => window.__db["users/u1"].lastDay) === "2026-11-18", "sequência gravada na conta");
  const rs = await p.innerText(".resumo");
  ok(/Boa tarde, Ana/.test(rs) && /1 jogo/.test(rs) && /5 dias/.test(rs), "resumo do dia: " + rs.replace(/\n/g, " "));
  await p.screenshot({path: "shots/n3-resumo.png"});
  await p.locator(".resumo button").click();
  ok(await p.locator(".resumo").count() === 0, "resumo some ao fechar");
  await p.reload(); await p.waitForSelector(".league"); await p.waitForTimeout(400);
  ok(await p.locator(".resumo").count() === 0, "resumo não volta no mesmo dia");
  await p.context().close();
  p = await ctx(browser, {}, conta(`{streak:4,lastDay:"2026-11-10"}`));
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.__db["users/u1"].streak) === 1, "faltou dia: sequência volta para 1");
  await p.context().close();

  /* ---------- BOLÃO ---------- */
  p = await ctx(browser, {}, conta("{}", []));
  await p.goto(URL + "#bolao"); await p.waitForSelector(".bl");
  ok(await p.locator(".bl").count() === 4, "bolão lista os jogos do dia");
  const fim = p.locator(".bl", {hasText: "Palmeiras"});
  ok(/Fim · 2 x 1/.test(await fim.innerText()) && await fim.locator(".bl-i").count() === 0, "jogo que já acabou não aceita palpite");
  const alvo = p.locator(".bl", {hasText: "Flamengo"});
  await alvo.locator(".bl-i").nth(0).fill("2"); await alvo.locator(".bl-i").nth(1).fill("1");
  await alvo.locator(".bl-i").nth(1).blur(); await p.waitForTimeout(400);
  const g = await p.evaluate(() => Object.entries(window.__db).filter(([k]) => k.startsWith("bolao/")).map(([k, v]) => ({k, ...v})));
  ok(g.length === 1 && g[0].h === 2 && g[0].a === 1 && g[0].dia === "2026-11-18" && g[0].mes === "2026-11" && g[0].pts === 0 && g[0].k === "bolao/u1__fla-vas",
    "palpite salvo: " + JSON.stringify({h: g[0] && g[0].h, a: g[0] && g[0].a, id: g[0] && g[0].k}));
  await p.screenshot({path: "shots/n4-bolao.png"});
  // o jogo acaba com o placar exato
  B.fixtures["brazilian-serie-a"][0].status = "finished";
  B.fixtures["brazilian-serie-a"][0].home_score = 2; B.fixtures["brazilian-serie-a"][0].away_score = 1;
  await p.evaluate(() => { pruneStore(true); for (const k in mem) delete mem[k]; dayCache = {}; bolaoMeus = null; bolaoDia = ""; bolaoRank = null; render(); });
  await p.waitForTimeout(2000);
  ok(/\+5 pontos/.test(await p.innerText("#app")), "placar exato vale 5 pontos");
  ok(await p.evaluate(() => Object.values(window.__db).find(v => v && v.matchId === "fla-vas").pts) === 5, "pontos gravados");
  await p.locator(".seg button", {hasText: "Ranking"}).click(); await p.waitForSelector(".rk");
  const rk = await p.innerText(".rk");
  ok(/1º/.test(rk) && /Ana Souza/.test(rk) && /você/.test(rk) && /5/.test(rk), "ranking do mês: " + rk.replace(/\n/g, " "));
  await p.screenshot({path: "shots/n5-ranking.png"});
  B.fixtures["brazilian-serie-a"][0].status = "upcoming";
  B.fixtures["brazilian-serie-a"][0].home_score = null; B.fixtures["brazilian-serie-a"][0].away_score = null;
  await p.context().close();
  // celular pequeno
  p = await ctx(browser, {...devices["iPhone SE"]}, conta("{}", [{slug: "flamengo", name: "Flamengo", logo: ""}]));
  await p.goto(URL + "#bolao"); await p.waitForSelector(".bl");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "bolão cabe no celular pequeno");
  await p.screenshot({path: "shots/n9-bolao-se.png"});
  await p.goto(URL); await p.waitForSelector(".league"); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "home com resumo e 🔥 cabe no celular pequeno");
  await p.screenshot({path: "shots/n10-home-se.png"});
  await p.context().close();

  /* ---------- TERMOS ---------- */
  p = await ctx(browser, {});
  await p.goto(URL); await p.waitForSelector("#g-enter");
  await p.click("#g-tosign"); await p.waitForSelector("#g-18");
  const href = await p.locator(".g-check a").getAttribute("href");
  ok(href === "termos/", "cadastro liga para os termos");
  await p.goto(URL + "termos/"); await p.waitForSelector("h2");
  const t = await p.innerText("body");
  ok(/Termos de uso/.test(t) && /LGPD/.test(t) && /não é uma casa de apostas/.test(t) && /parceria/.test(t) && /18 anos/.test(t), "página de termos completa");
  ok(await p.locator(".volta").count() === 1 && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "termos cabem no celular");
  await p.screenshot({path: "shots/n6-termos.png", fullPage: true});
  await p.context().close();

  /* ---------- PAINEL: cliques e desfalques ---------- */
  const TK = {date: hoje, tipo: "Seguro", odd: "2.10", codigo: "A1", order: 1, clicks: 7, sel: [{jogo: "A x B", mercado: "Mais de 2.5"}]};
  const TK2 = {date: hoje, tipo: "Muito arriscado", odd: "9.0", codigo: "A2", order: 4, clicks: 1, sel: [{jogo: "C x D", mercado: "Vitória do C"}]};
  p = await ctx(browser, {}, conta("{}", []) + `window.__db["tickets/t1"]=${JSON.stringify(TK)};`);
  await p.goto(URL); await p.waitForSelector(".league"); await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForSelector(".ready-btn");
  ok(await p.locator(".dia").count() === 1 && /Palpite do dia/.test(await p.innerText(".dia")), "bilhete de uma seleção vira o Palpite do dia");
  await p.locator(".ready-btn").click({noWaitAfter: true}); await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__db["tickets/t1"].clicks) === 8, "clique em Apostar soma no bilhete");
  await p.context().close();

  const adm = `window.__user={uid:"adm",email:${JSON.stringify(B.ADM)},displayName:"Admin",providerData:[]};
    window.__db={"users/c":{status:"approved",name:"Ana",email:"a@teste.local",createdAt:{toMillis:()=>Date.now()},lastSeen:{toMillis:()=>Date.now()}},
      "tickets/t1":${JSON.stringify(TK)},"tickets/t2":${JSON.stringify(TK2)}};`;
  p = await ctx(browser, {viewport: {width: 1100, height: 950}, isMobile: false, hasTouch: false, deviceScaleFactor: 1}, adm);
  await p.goto(URL + "admin/"); await p.waitForSelector(".stats");
  await p.click("[data-tab=tk]"); await p.waitForSelector(".conv");
  const conv = await p.innerText(".conv");
  ok(/7/.test(conv) && /Seguro/.test(conv) && /1/.test(conv), "painel mostra cliques por nível");
  const hints = (await p.$$eval(".hint", e => e.map(x => x.textContent))).join(" | ");
  ok(/mais converte é Seguro, com 7.0 cliques/.test(hints), "painel diz qual nível converte mais");
  ok(/Cliques em Apostar: 7/.test(await p.innerText(".tk")), "cliques por bilhete na lista");
  await p.screenshot({path: "shots/n7-admin-converte.png"});
  await p.click("[data-tab=dq]"); await p.waitForSelector("#dq-new");
  await p.click("#dq-new"); await p.waitForSelector("#d-time");
  await p.fill("#d-time", "Flamengo");
  await p.fill("#d-lista", "Pedro - lesão\nLéo Pereira - suspenso\nArrascaeta");
  await p.screenshot({path: "shots/n8-admin-desfalques.png"});
  await p.click("#d-save"); await p.waitForSelector(".dqc");
  const d = await p.evaluate(() => window.__db["desfalques/flamengo"]);
  ok(d && d.time === "Flamengo" && d.lista.length === 3 && d.lista[0].motivo === "lesão" && d.lista[2].nome === "Arrascaeta" && d.lista[2].motivo === "",
    "desfalques salvos: " + JSON.stringify(d && d.lista));
  p.once("dialog", x => x.accept()); await p.click("[data-dqx]"); await p.waitForSelector(".dqc", {state: "detached"});
  ok(true, "excluir desfalques funciona");
  await p.context().close();

  /* ---------- MONTAR OS 5 BILHETES DO DIA (admin) ---------- */
  // mais jogos por começar, para o gerador ter material
  const extras = [["pal-fla", "Palmeiras", "Flamengo", 10], ["int-pal", "Internacional", "Palmeiras", 11], ["vas-gre", "Vasco da Gama", "Gremio", 12]]
    .map(([id, h, a, t]) => ({url: `/football/match/${id}/`, home: h, away: a, home_logo: "", away_logo: "", time: iso(t),
      status: "upcoming", status_text: "upcoming", home_score: null, away_score: null, competition: "Liga"}));
  B.fixtures["brazilian-serie-a"].push(...extras);

  const admApp = `window.__user={uid:"adm",email:${JSON.stringify(B.ADM)},displayName:"Jorge",providerData:[]};
    window.__db={"users/adm":{status:"approved",name:"Jorge",opens:1,favs:[]}};`;
  p = await ctx(browser, {}, admApp);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForSelector(".gerar");
  ok(/Montar os bilhetes de hoje/.test(await p.innerText(".gerar")), "admin vê o botão de montar bilhetes");
  await p.click(".gerar .gen");
  await p.waitForSelector(".gerar .ready", {timeout: 60000});
  const bl = await p.$$eval(".gerar .ready", e => e.map(x => ({
    nivel: x.querySelector(".rsk").textContent.trim(), chance: x.querySelector(".ready-odd").textContent, legs: x.querySelectorAll(".ready-sel").length})));
  ok(bl.length >= 3, "montou vários bilhetes: " + bl.length);
  ok(bl.every((b, i) => i === 0 || b.legs > bl[i - 1].legs), "cada bilhete tem mais seleções que o anterior: " + bl.map(b => b.legs).join(","));
  ok(new Set(bl.map(b => b.nivel)).size === bl.length, "um nível por bilhete, sem repetir: " + bl.map(b => b.nivel).join(" | "));
  ok(bl.every((b, i) => i === 0 || parseInt(b.chance) <= parseInt(bl[i - 1].chance)), "a chance cai conforme entram mais jogos: " + bl.map(b => b.chance).join(" "));
  ok(/confira antes de publicar/.test(await p.innerText(".gerar h4")), "pede conferência antes de publicar");
  await p.screenshot({path: "shots/n11-gerar.png"});
  await p.click(".gerar .g2 .gen"); await p.waitForTimeout(900);
  const salvos = await p.evaluate(() => Object.entries(window.__db).filter(([k]) => k.startsWith("tickets/")).map(([, v]) => v));
  ok(salvos.length === bl.length && salvos.every(t => t.date === "2026-11-18" && t.codigo === "" && t.clicks === 0 && t.sel.length > 0),
    "bilhetes salvos no banco: " + salvos.length);
  ok(salvos.map(t => t.tipo).sort().join("|") === bl.map(b => b.nivel).sort().join("|"), "níveis salvos batem com a prévia");
  await p.waitForSelector(".ready-wrap");
  const naTela = await p.locator(".ready-wrap .ready").count() + await p.locator(".dia").count();
  ok(naTela === bl.length, `os ${bl.length} bilhetes aparecem na aba Palpites depois de publicar (${naTela})`);
  await p.screenshot({path: "shots/n12-publicados.png"});
  await p.context().close();
  // usuário comum não vê o botão
  p = await ctx(browser, {}, conta("{}", []));
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click(); await p.waitForTimeout(500);
  ok(await p.locator(".gerar").count() === 0, "usuário comum não vê o botão de montar");
  await p.context().close();
  extras.forEach(x => B.fixtures["brazilian-serie-a"].splice(B.fixtures["brazilian-serie-a"].indexOf(x), 1));

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], "\n", errors.join("\n")); process.exit(1); });
