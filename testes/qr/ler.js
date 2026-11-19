/* Leitor de QR usado só para conferir o gerador: lê a grade como um
   leitor de verdade leria — pelo formato gravado nela, não pelo que
   o gerador disse — e confere a correção de erro. */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
const VERSOES = [null, [10,[1,16]], [16,[1,28]], [26,[1,44]], [18,[2,32]], [24,[2,43]],
  [16,[4,27]], [18,[4,31]], [22,[2,38],[2,39]], [22,[3,36],[2,37]], [26,[4,43],[1,44]]];
const ALINHA = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];

function ler(m) {
  const N = m.length, versao = (N - 17) / 4;
  if (!Number.isInteger(versao) || versao < 1 || versao > 10) throw new Error("tamanho estranho: " + N);

  // 1) formato: lê os 15 bits da cópia de cima e confere o BCH
  let f = 0;
  for (let i = 0; i < 15; i++) f |= m[i < 6 ? i : i < 8 ? i + 1 : N - 15 + i][8] << i;
  f ^= 0x5412;
  let d = f, restoBch = f;
  for (let i = 4; i >= 0; i--) if (restoBch & (1 << (i + 10))) restoBch ^= 0x537 << i;
  if (restoBch !== 0) throw new Error("formato não bate com o BCH");
  const nivel = (f >> 13) & 3, mascara = (f >> 10) & 7;
  // a segunda cópia tem que dizer a mesma coisa
  let f2 = 0;
  for (let i = 0; i < 15; i++) f2 |= m[8][i < 8 ? N - 1 - i : i < 9 ? 15 - i : 15 - i - 1] << i;
  if ((f2 ^ 0x5412) !== f) throw new Error("as duas cópias do formato não batem");
  if (m[N - 8][8] !== 1) throw new Error("módulo escuro apagado");

  // 2) marca o que é estrutura, do mesmo jeito que um leitor marca
  const fixo = Array.from({length: N}, () => new Array(N).fill(false));
  const mk = (x, y) => { if (x >= 0 && y >= 0 && x < N && y < N) fixo[y][x] = true; };
  for (const [cx, cy] of [[0,0],[N-7,0],[0,N-7]])
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) mk(cx+dx, cy+dy);
  for (let i = 0; i < N; i++) { mk(i, 6); mk(6, i); }
  const cs = ALINHA[versao];
  for (const cy of cs) for (const cx of cs) {
    if ((cx < 9 && cy < 9) || (cx > N-10 && cy < 9) || (cx < 9 && cy > N-10)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mk(cx+dx, cy+dy);
  }
  for (let i = 0; i < 9; i++) { mk(i, 8); mk(8, i); }
  for (let i = 0; i < 8; i++) { mk(N-1-i, 8); mk(8, N-1-i); }
  if (versao >= 7) for (let i = 0; i < 18; i++) { const a = Math.floor(i/3), c = i%3; mk(a, N-11+c); mk(N-11+c, a); }

  // 3) tira a máscara e lê os bits no zigue-zague
  const regra = (x, y, k) => [
    (y+x)%2, y%2, x%3, (y+x)%3, (Math.floor(y/2)+Math.floor(x/3))%2,
    ((y*x)%2)+((y*x)%3), (((y*x)%2)+((y*x)%3))%2, (((y+x)%2)+((y*x)%3))%2][k] === 0;
  const bits = [];
  let subindo = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < N; k++) {
      const y = subindo ? N - 1 - k : k;
      for (const x of [col, col - 1]) if (!fixo[y][x]) bits.push(m[y][x] ^ (regra(x, y, mascara) ? 1 : 0));
    }
    subindo = !subindo;
  }
  const fluxo = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) fluxo.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // 4) desintercala e confere a correção de erro bloco a bloco
  const [ec, ...grupos] = VERSOES[versao];
  const tam = [];
  for (const [qtd, n] of grupos) for (let i = 0; i < qtd; i++) tam.push(n);
  const nb = tam.length, maxD = Math.max(...tam);
  const blocosD = tam.map(n => new Array(n)), blocosE = tam.map(() => new Array(ec));
  let p = 0;
  for (let i = 0; i < maxD; i++) for (let b = 0; b < nb; b++) if (i < tam[b]) blocosD[b][i] = fluxo[p++];
  for (let i = 0; i < ec; i++) for (let b = 0; b < nb; b++) blocosE[b][i] = fluxo[p++];
  blocosD.forEach((bd, i) => {
    const todos = [...bd, ...blocosE[i]];
    for (let s = 0; s < ec; s++) {
      let v = 0;
      for (const c of todos) v = mul(v, EXP[s]) ^ c;
      if (v !== 0) throw new Error("correção de erro não fecha no bloco " + i);
    }
  });

  // 5) lê o conteúdo
  const dados = blocosD.flat();
  const bb = dados.flatMap(b => [7,6,5,4,3,2,1,0].map(i => (b >> i) & 1));
  let q = 0;
  const pega = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bb[q++]; return v; };
  const modo = pega(4);
  if (modo !== 4) throw new Error("modo inesperado: " + modo);
  const tamTexto = pega(versao < 10 ? 8 : 16);
  const bytes = []; for (let i = 0; i < tamTexto; i++) bytes.push(pega(8));
  return {versao, nivel, mascara, texto: new TextDecoder().decode(Uint8Array.from(bytes))};
}
module.exports = {ler};
