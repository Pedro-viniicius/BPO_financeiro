/**
 * Verifica as licencas das dependencias de PRODUCAO.
 *
 * O produto e software proprietario comercial. Dependencias com licenca
 * "copyleft forte" (GPL, AGPL, SSPL...) podem obrigar a distribuicao do nosso
 * codigo-fonte, entao a verificacao FALHA se alguma aparecer.
 *
 * Licencas permissivas (MIT, ISC, BSD, Apache-2.0...) sao aceitas.
 * LGPL/MPL sao "copyleft fraco": permitidas com aviso, pois obrigam apenas a
 * liberar alteracoes feitas NA biblioteca, nao no nosso codigo. Aparecem no
 * relatorio para revisao humana. Ver docs/licenciamento.md, secao 10.
 *
 * Uso: `pnpm verificar:licencas`
 */
import { execFileSync } from "node:child_process";

const PERMITIDAS = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
  "CC-BY-4.0",
  "CC-BY-3.0",
  "MIT-0",
  "WTFPL",
  "Zlib",
]);

const COM_AVISO = new Set(["LGPL-2.1", "LGPL-3.0", "LGPL-2.1-or-later", "LGPL-3.0-or-later", "MPL-2.0", "EPL-2.0", "CDDL-1.0"]);

const PROIBIDAS = /^(GPL|AGPL|SSPL|EUPL|OSL|CPAL|BUSL|Commons-Clause)/i;

const saida = execFileSync("npx", ["license-checker-rseidelsohn", "--production", "--json", "--excludePrivatePackages"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const pacotes = JSON.parse(saida);

const proibidos = [];
const avisos = [];
const desconhecidos = [];

for (const [nome, info] of Object.entries(pacotes)) {
  const licencas = String(info.licenses ?? "DESCONHECIDA")
    .replace(/[()]/g, "")
    .split(/\s+(?:OR|AND)\s+/i)
    .map((l) => l.replace(/\*$/, "").trim());

  // Com "OR", basta uma opcao permitida.
  if (licencas.some((l) => PERMITIDAS.has(l))) continue;
  if (licencas.some((l) => PROIBIDAS.test(l))) {
    proibidos.push(`${nome}: ${info.licenses}`);
    continue;
  }
  if (licencas.some((l) => COM_AVISO.has(l))) {
    avisos.push(`${nome}: ${info.licenses}`);
    continue;
  }
  desconhecidos.push(`${nome}: ${info.licenses}`);
}

console.log(`Dependencias de producao analisadas: ${Object.keys(pacotes).length}`);
if (avisos.length) {
  console.log(`\nAVISO — copyleft fraco (permitido, revisar obrigacoes ao distribuir):\n  ${avisos.join("\n  ")}`);
}
if (desconhecidos.length) {
  console.log(`\nAVISO — licenca desconhecida ou nao classificada (revisar manualmente):\n  ${desconhecidos.join("\n  ")}`);
}
if (proibidos.length) {
  console.error(`\nERRO — licencas incompativeis com software proprietario:\n  ${proibidos.join("\n  ")}`);
  process.exit(1);
}
console.log("\nNenhuma licenca incompativel encontrada.");
