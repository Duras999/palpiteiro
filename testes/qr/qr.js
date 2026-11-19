/* Gerador de QR code, modo byte, correção M, versões 1 a 10.
   Escrito à mão para o app não depender de biblioteca de fora. */
(function (raiz) {
  // --- aritmética do corpo finito usado pela correção de erro ---
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  const gerador = n => {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const novo = new Array(g.length + 1).fill(0);
      // g fica em ordem decrescente: g[0] é o coeficiente do maior expoente
      for (let j = 0; j < g.length; j++) { novo[j] ^= g[j]; novo[j + 1] ^= mul(g[j], EXP[i]); }
      g = novo;
    }
    return g;
  };
  const resto = (dados, n) => {
    const g = gerador(n), r = new Array(n).fill(0);
    for (const d of dados) {
      const f = d ^ r[0];
      r.shift(); r.push(0);
      if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
    }
    return r;
  };

  // versão: [codewords de correção por bloco, [blocos, dados], [blocos, dados]]
  const VERSOES = [
    null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]
  ];
  const ALINHA = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  const bchFormato = v => { let d = v << 10; for (let i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= 0x537 << i; return ((v << 10) | d) ^ 0x5412; };
  const bchVersao = v => { let d = v << 12; for (let i = 5; i >= 0; i--) if (d & (1 << (i + 12))) d ^= 0x1f25 << i; return (v << 12) | d; };

  function matriz(texto) {
    const bytes = new TextEncoder().encode(texto);
    let versao = 0;
    for (let v = 1; v <= 10; v++) {
      const d = VERSOES[v].slice(1).reduce((a, [b, n]) => a + b * n, 0);
      const cabeca = 4 + (v < 10 ? 8 : 16);
      if (d * 8 - cabeca >= bytes.length * 8) { versao = v; break; }
    }
    if (!versao) throw new Error("texto longo demais para o QR");

    const [ec, ...grupos] = VERSOES[versao];
    const totalDados = grupos.reduce((a, [b, n]) => a + b * n, 0);

    // monta o fluxo de bits: modo, tamanho, conteúdo, fim e enchimento
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    put(4, 4);
    put(bytes.length, versao < 10 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    for (let i = 0; i < 4 && bits.length < totalDados * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const dados = [];
    for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let i = 0; dados.length < totalDados; i++) dados.push(i % 2 ? 0x11 : 0xec);

    // separa em blocos, calcula a correção de cada um e intercala
    const blocosD = [], blocosE = [];
    let p = 0;
    for (const [qtd, n] of grupos) for (let i = 0; i < qtd; i++) {
      const b = dados.slice(p, p + n); p += n;
      blocosD.push(b); blocosE.push(resto(b, ec));
    }
    const fluxo = [];
    const maxD = Math.max(...blocosD.map(b => b.length));
    for (let i = 0; i < maxD; i++) for (const b of blocosD) if (i < b.length) fluxo.push(b[i]);
    for (let i = 0; i < ec; i++) for (const b of blocosE) fluxo.push(b[i]);

    // desenha a grade
    const N = versao * 4 + 17;
    const m = Array.from({length: N}, () => new Array(N).fill(null));
    const fixo = Array.from({length: N}, () => new Array(N).fill(false));
    const por = (x, y, v) => { if (x >= 0 && y >= 0 && x < N && y < N) { m[y][x] = v; fixo[y][x] = true; } };

    const finder = (cx, cy) => {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx, y = cy + dy;
        const borda = dx === -1 || dx === 7 || dy === -1 || dy === 7;
        const dentro = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        const anel = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        por(x, y, borda ? 0 : (anel || dentro) ? 1 : 0);
      }
    };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);

    for (let i = 8; i < N - 8; i++) { por(i, 6, i % 2 === 0 ? 1 : 0); por(6, i, i % 2 === 0 ? 1 : 0); }

    const cs = ALINHA[versao];
    for (const cy of cs) for (const cx of cs) {
      if ((cx < 9 && cy < 9) || (cx > N - 10 && cy < 9) || (cx < 9 && cy > N - 10)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        por(cx + dx, cy + dy, (Math.abs(dx) === 2 || Math.abs(dy) === 2 || (dx === 0 && dy === 0)) ? 1 : 0);
    }

    // reserva o espaço do formato dos dois lados, sem apagar o que já existe
    for (let i = 0; i < 9; i++) { por(i, 8, m[8][i] === null ? 0 : m[8][i]); por(8, i, m[i][8] === null ? 0 : m[i][8]); }
    for (let i = 0; i < 8; i++) { por(N - 1 - i, 8, 0); por(8, N - 1 - i, 0); }
    por(8, N - 8, 1);                       // módulo que é sempre escuro, por último

    if (versao >= 7) {
      const vi = bchVersao(versao);
      for (let i = 0; i < 18; i++) {
        const b = (vi >> i) & 1, a = Math.floor(i / 3), c = i % 3;
        por(a, N - 11 + c, b); por(N - 11 + c, a, b);
      }
    }

    // joga os dados no zigue-zague, de baixo para cima
    let bi = 0, subindo = true;
    const livre = [];
    for (let col = N - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let k = 0; k < N; k++) {
        const y = subindo ? N - 1 - k : k;
        for (const x of [col, col - 1]) if (!fixo[y][x]) livre.push([x, y]);
      }
      subindo = !subindo;
    }
    for (const [x, y] of livre) {
      const b = bi < fluxo.length * 8 ? (fluxo[bi >> 3] >> (7 - (bi & 7))) & 1 : 0;
      m[y][x] = b; bi++;
    }

    const regra = (x, y, k) => [
      (y + x) % 2, y % 2, x % 3, (y + x) % 3,
      (Math.floor(y / 2) + Math.floor(x / 3)) % 2,
      ((y * x) % 2) + ((y * x) % 3), (((y * x) % 2) + ((y * x) % 3)) % 2,
      (((y + x) % 2) + ((y * x) % 3)) % 2
    ][k] === 0;

    const penal = g => {
      let s = 0;
      const linhas = [g, g[0].map((_, i) => g.map(r => r[i]))];
      for (const L of linhas) for (const r of L) {
        let run = 1;
        for (let i = 1; i < r.length; i++) {
          if (r[i] === r[i - 1]) run++; else { if (run >= 5) s += 3 + run - 5; run = 1; }
        }
        if (run >= 5) s += 3 + run - 5;
        const t = r.join("");
        for (const pat of ["1011101 0000", "0000 1011101"].map(x => x.replace(" ", ""))) {
          let i = -1; while ((i = t.indexOf(pat, i + 1)) >= 0) s += 40;
        }
      }
      for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++)
        if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) s += 3;
      const escuros = g.flat().filter(v => v === 1).length;
      s += 10 * Math.floor(Math.abs(escuros * 100 / (N * N) - 50) / 5);
      return s;
    };

    let melhor = null, melhorNota = Infinity;
    for (let k = 0; k < 8; k++) {
      const g = m.map((r, y) => r.map((v, x) => fixo[y][x] ? v : (v ^ (regra(x, y, k) ? 1 : 0))));
      const f = bchFormato((0 << 3) | k);   // 0 = nível M
      for (let i = 0; i < 15; i++) {
        const b = (f >> i) & 1;
        g[i < 6 ? i : i < 8 ? i + 1 : N - 15 + i][8] = b;          // cópia de cima, na coluna 8
        g[8][i < 8 ? N - 1 - i : i < 9 ? 15 - i : 15 - i - 1] = b; // cópia da direita, na linha 8
      }
      g[N - 8][8] = 1;
      const nota = penal(g);
      if (nota < melhorNota) { melhorNota = nota; melhor = g; }
    }
    return melhor;
  };

  raiz.qrMatriz = matriz;
  if (typeof module !== "undefined") module.exports = {matriz};
})(typeof window !== "undefined" ? window : globalThis);
