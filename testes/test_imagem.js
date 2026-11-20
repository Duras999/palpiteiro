const B = require("./base.js");
const {chromium, srv, ctx, ok, errors} = B;
const fs = require("fs"), path = require("path");
const PORT = 8783, URL = `http://localhost:${PORT}/ia/`;
const hoje = "2026-11-18";
const LEITOR = fs.readFileSync(path.join(__dirname, "qr", "ler.js"), "utf8")
  .replace("module.exports = {ler};", "window.__ler = ler;");
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch();
  const db = {"users/u1": {status: "approved", name: "Ana Souza", opens: 3},
    "tickets/t1": {date: hoje, tipo: "Seguro", odd: "2.10", order: 0, codigo: "AB12",
      sel: [{jogo: "Flamengo x Vasco da Gama", hora: "21:30", mercado: "Vitória do Flamengo"},
            {jogo: "Arsenal x Chelsea", hora: "16:00", mercado: "Mais de 2.5 gols"},
            {jogo: "Gremio x Internacional", hora: "19:00", mercado: "Ambas marcam: Sim"}]},
    "tickets/t2": {date: hoje, tipo: "Muito arriscado", odd: "12.40", order: 1,
      sel: [{jogo: "Palmeiras x Corinthians", hora: "18:30", mercado: "Mais de 4.5 cartões"}]}};
  const p = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db=${JSON.stringify(db)};
    try{localStorage.setItem("pal-favs","[]");}catch(e){}`);
  await p.goto(URL); await p.waitForSelector(".league");
  await p.locator(".seg button", {hasText: "Palpites"}).click();
  await p.waitForSelector(".dia", {timeout: 8000});

  /* ---------- o QR gerado dentro do app é mesmo legível ---------- */
  await p.evaluate(LEITOR);
  const qr = await p.evaluate(() => {
    const alvos = ["https://opalpiteiro.online/", "oi", "acentuação ção", "x".repeat(100)];
    return alvos.map(a => { try { const r = window.__ler(qrMatriz(a)); return {a, lido: r.texto, v: r.versao}; }
      catch (e) { return {a, lido: "ERRO " + e.message}; } });
  });
  ok(qr.every(x => x.lido === x.a), "o QR feito dentro do app volta a ser lido certo: " + qr.map(x => "v" + x.v).join(", "));
  const nivel = await p.evaluate(() => window.__ler(qrMatriz("https://opalpiteiro.online/")).nivel);
  ok(nivel === 0, "QR gravado no nível de correção M, que aguenta logo e dobra no papel");

  /* ---------- a imagem do bilhete ---------- */
  const img = await p.evaluate(() => {
    const b = window.palTickets.find(t => t.id === "t1");
    const c = imagemDoBilhete(b);
    const x = c.getContext("2d");
    // procura o QR dentro da imagem: um quadrado branco no canto de baixo
    const d = x.getImageData(80, 980, 10, 10).data;
    return {w: c.width, h: c.height, branco: d[0] > 200 && d[1] > 200 && d[2] > 200,
            tipo: c.toDataURL("image/png").slice(0, 22)};
  });
  ok(img.w === 1080 && img.h === 1350, "imagem sai em 1080x1350, o formato que o Instagram e o status pedem");
  ok(img.branco, "o QR code aparece dentro da imagem do bilhete");
  ok(img.tipo === "data:image/png;base64,", "imagem sai em PNG");

  const aviso = await p.evaluate(() => AVISO_IMG.join(" "));
  ok(/análise estatística/.test(aviso) && /não garante resultado/.test(aviso) && /\+18/.test(aviso),
    "a imagem leva o aviso de que é análise e não garante resultado");

  /* ---------- o botão está nos dois lugares ---------- */
  ok(await p.locator(".dia .shr").count() === 1, "palpite do dia tem o botão de imagem");
  ok(await p.locator(".ready-wrap .ready").count() === 0, "a lista de bilhetes saiu da aba Palpites");
  ok(/Imagem/.test(await p.locator(".dia .shr").first().innerText()), "o botão de imagem diz Imagem");

  /* ---------- clicar baixa o arquivo quando o celular não sabe compartilhar ---------- */
  await p.evaluate(() => { delete navigator.canShare; });
  const [down] = await Promise.all([
    p.waitForEvent("download", {timeout: 15000}),
    p.locator(".dia .shr").first().click()
  ]);
  ok(/^palpiteiro-.*\.png$/.test(down.suggestedFilename()), "baixa o arquivo com nome do app: " + down.suggestedFilename());
  await p.waitForTimeout(400);
  ok(await p.locator(".dia .shr").first().innerText() === "Imagem", "o botão volta ao normal depois");

  /* ---------- quando o celular sabe, abre o compartilhar do sistema ---------- */
  await p.evaluate(() => {
    window.__share = null;
    navigator.canShare = o => !!(o && o.files);
    navigator.share = async o => { window.__share = {arquivos: o.files.map(f => ({nome: f.name, tipo: f.type, tam: f.size})), texto: o.text}; };
  });
  await p.locator(".dia .shr").click();
  await p.waitForTimeout(1200);
  const sh = await p.evaluate(() => window.__share);
  ok(sh && sh.arquivos.length === 1 && sh.arquivos[0].tipo === "image/png" && sh.arquivos[0].tam > 10000,
    "manda a imagem pro compartilhar do celular (" + (sh && Math.round(sh.arquivos[0].tam / 1024)) + " KB)");
  ok(sh && /opalpiteiro\.online/.test(sh.texto), "o texto que acompanha leva o endereço do app");

  /* ---------- bilhete grande não estoura ---------- */
  const grande = await p.evaluate(() => {
    const b = {id: "x", date: "2026-11-18", tipo: "Arriscado", odd: "25.00",
      sel: Array.from({length: 9}, (_, i) => ({jogo: "Time Com Nome Muito Comprido " + i + " x Outro Time Comprido", hora: "20:00", mercado: "Mercado bem comprido de teste número " + i}))};
    const c = imagemDoBilhete(b);
    return {w: c.width, h: c.height};
  });
  ok(grande.w === 1080 && grande.h === 1350, "bilhete de 9 jogos continua cabendo na mesma imagem");

  await p.context().close();
  /* ---------- a aba Meu bilhete: um botão só, que vira imagem ---------- */
  const slip = [
    {id: "fla-vas", mk: "Vitória do Flamengo", conf: 74, h: "Flamengo", a: "Vasco da Gama", hl: "", t: new Date(Date.now() + 9 * 3600000).toISOString()},
    {id: "ars-che", mk: "Mais de 2.5 gols", conf: 66, h: "Arsenal", a: "Chelsea", hl: "", t: new Date(Date.now() + 8 * 3600000).toISOString()},
    {id: "gre-int", mk: "Ambas marcam: Sim", conf: 61, h: "Gremio", a: "Internacional", hl: "", t: new Date(Date.now() + 7 * 3600000).toISOString()}
  ];
  const q = await ctx(browser, {}, `
    window.__user={uid:"u1",email:"ana@teste.local",displayName:"Ana",providerData:[]};
    window.__db={"users/u1":{status:"approved",name:"Ana",opens:3}};
    try{localStorage.setItem("pal-favs","[]");localStorage.setItem("iag-slip2",${JSON.stringify(JSON.stringify(slip))});}catch(e){}`);
  await q.goto(URL + "#bilhete"); await q.waitForSelector(".slip-item", {timeout: 10000});
  const bts = await q.$$eval(".box .gen", e => e.map(x => x.textContent.trim()));
  ok(bts.length === 1 && bts[0] === "Compartilhar palpite", "a aba Meu bilhete tem um botão só: " + bts.join(" | "));
  ok(!/Apostar/.test(await q.innerText("#app")), "o botão Apostar saiu da aba Meu bilhete");
  ok(await q.locator(".slip-item").count() === 3, "as três seleções continuam listadas");

  const mb = await q.evaluate(async () => {
    const logo = await carregarLogo();
    const lista = slip.map(s => ({jogo: short(s.h) + " x " + short(s.a), mercado: s.mk, conf: s.conf}));
    const resumo = {n: slip.length, media: 67, chance: 30};
    const c = imagemDoMeuBilhete(lista, logo, resumo);
    const x = c.getContext("2d");
    const pt = (px, py) => { const d = x.getImageData(px, py, 6, 6).data; return {r: d[0], g: d[1], b: d[2]}; };
    const W_ = c.width;
    return {w: c.width, h: c.height, temLogo: !!logo,
            qrEsquerda: pt(160, 80), qrDireita: pt(W_ - 160, 80)};
  });
  ok(mb.w === 1080 && mb.h === 1350, "imagem do meu bilhete no mesmo formato de postar");
  ok(mb.temLogo, "usa o logo de verdade do app, não um desenho");
  ok(mb.qrEsquerda.r > 200 && mb.qrEsquerda.g > 200, "o QR do app fica na esquerda de cima");
  ok(mb.qrDireita.r > 200 && mb.qrDireita.g > 200, "o QR da casa fica na direita de cima");

  // os dois QR precisam apontar para os lugares certos
  await q.evaluate(LEITOR);
  const alvos = await q.evaluate(() => ({
    app: window.__ler(qrMatriz("https://opalpiteiro.online/")).texto,
    casa: window.__ler(qrMatriz(LINK_CASA)).texto,
    linkCasa: LINK_CASA
  }));
  ok(alvos.app === "https://opalpiteiro.online/", "o QR da esquerda abre o app");
  ok(alvos.casa === alvos.linkCasa && /b\.ingoem\.casa/.test(alvos.casa),
    "o QR da direita abre o cadastro na casa: " + alvos.casa);
  const legendas = await q.evaluate(async () => {
    const logo = await carregarLogo();
    const c = imagemDoMeuBilhete([{jogo: "A x B", mercado: "Teste"}], logo);
    return c.width;
  });
  ok(legendas === 1080, "a imagem com os dois QR continua no mesmo tamanho");

  // o risco de cada palpite e o resumo do bilhete entram mesmo na imagem
  const comSem = await q.evaluate(async () => {
    const logo = await carregarLogo();
    const base = slip.map(s => ({jogo: short(s.h) + " x " + short(s.a), mercado: s.mk, conf: s.conf}));
    const semConf = base.map(z => ({...z, conf: 0}));
    const r = {n: 3, media: 67, chance: 30};
    const png = (l, res) => imagemDoMeuBilhete(l, logo, res).toDataURL("image/png");
    return {comRisco: png(base, r), semRisco: png(semConf, r), semResumo: png(base, null)};
  });
  ok(comSem.comRisco !== comSem.semRisco, "o selo de risco com a porcentagem aparece em cada palpite");
  ok(comSem.comRisco !== comSem.semResumo, "a faixa de confiança média e chance aparece embaixo");

  await q.evaluate(() => { delete navigator.canShare; });
  const [arq] = await Promise.all([
    q.waitForEvent("download", {timeout: 15000}),
    q.locator(".box .gen").click()
  ]);
  ok(/^meu-bilhete-\d{4}-\d{2}-\d{2}\.png$/.test(arq.suggestedFilename()),
    "baixa com o nome do dia: " + arq.suggestedFilename());
  await q.context().close();

  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
