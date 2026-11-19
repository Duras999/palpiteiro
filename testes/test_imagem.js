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
  await p.waitForSelector(".ready", {timeout: 8000});

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
  ok(await p.locator(".ready .shr").count() === 1, "bilhete pronto tem o botão de imagem");
  ok(/Imagem/.test(await p.locator(".ready .shr").first().innerText()), "botão diz Imagem");

  /* ---------- clicar baixa o arquivo quando o celular não sabe compartilhar ---------- */
  await p.evaluate(() => { delete navigator.canShare; });
  const [down] = await Promise.all([
    p.waitForEvent("download", {timeout: 15000}),
    p.locator(".ready .shr").first().click()
  ]);
  ok(/^palpiteiro-.*\.png$/.test(down.suggestedFilename()), "baixa o arquivo com nome do app: " + down.suggestedFilename());
  await p.waitForTimeout(400);
  ok(await p.locator(".ready .shr").first().innerText() === "Imagem", "o botão volta ao normal depois");

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
  console.log(errors.length ? "ERROS:\n" + [...new Set(errors)].join("\n") : "sem erros no console");
  await browser.close(); srv.close();
})().catch(e => { console.error("TESTE QUEBROU", e.message.split("\n")[0], errors); process.exit(1); });
