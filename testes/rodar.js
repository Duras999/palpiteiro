/* Roda a suíte inteira e só termina bem se tudo passar.
   É isso que o GitHub chama a cada publicação. */
const {spawnSync} = require("child_process");
const fs = require("fs"), path = require("path");
const arquivos = fs.readdirSync(__dirname).filter(f => /^test_.*\.js$/.test(f)).sort();
if (!arquivos.length) { console.error("Nenhum teste encontrado."); process.exit(1); }
fs.mkdirSync(path.join(__dirname, "shots"), {recursive: true});
let okTotal = 0, falhas = [], quebrados = [];
for (const f of arquivos) {
  const r = spawnSync(process.execPath, [f], {cwd: __dirname, encoding: "utf8", timeout: 15 * 60000});
  const saida = (r.stdout || "") + (r.stderr || "");
  const ok = (saida.match(/^PASS /gm) || []).length;
  const ruim = (saida.match(/^FAIL .*/gm) || []);
  const erros = /^ERROS:/m.test(saida);
  okTotal += ok;
  if (ruim.length) falhas.push(...ruim.map(x => f + ": " + x));
  if (r.status !== 0 || erros) { quebrados.push(f); console.log(saida.trim()); }
  console.log(`${f.padEnd(18)} ${String(ok).padStart(3)} ok  ${ruim.length} falhas${r.status !== 0 ? "  (quebrou)" : ""}${erros ? "  (erro no console)" : ""}`);
}
console.log("\n" + okTotal + " verificações passaram em " + arquivos.length + " arquivos.");
if (falhas.length) { console.log("\nFalhas:"); falhas.forEach(x => console.log("  " + x)); }
if (quebrados.length) console.log("\nArquivos com problema: " + quebrados.join(", "));
process.exit(falhas.length || quebrados.length ? 1 : 0);
