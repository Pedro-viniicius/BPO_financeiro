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
import { existsSync, readFileSync } from "node:fs";

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
/*
 * CODIGO DE TERCEIRO INCORPORADO (nao vem de node_modules).
 *
 * O `license-checker` so enxerga pacotes instalados. Codigo copiado para o
 * repositorio (ADR-028) precisa de inventario proprio: cada entrada abaixo
 * exige que o arquivo exista e que o aviso de licenca do autor continue nele.
 * Sem isso, a licenca MIT — que obriga a manter o aviso — estaria sendo
 * cumprida so por confianca.
 */
const CODIGO_INCORPORADO = [
  {
    arquivo: "src/compartilhado/qr/qrcodegen.ts",
    titular: "Project Nayuki",
    licenca: "MIT",
    marcador: "Copyright (c) Project Nayuki. (MIT License)",
    origem: "https://github.com/nayuki/QR-Code-generator",
  },
];

const incorporadoComProblema = [];
for (const item of CODIGO_INCORPORADO) {
  if (!existsSync(item.arquivo)) {
    incorporadoComProblema.push(`${item.arquivo}: arquivo nao encontrado (esta no inventario, ADR-028)`);
    continue;
  }
  if (!readFileSync(item.arquivo, "utf-8").includes(item.marcador)) {
    incorporadoComProblema.push(`${item.arquivo}: aviso de licenca de ${item.titular} ausente ou alterado`);
    continue;
  }
  console.log(`Codigo incorporado: ${item.arquivo} — ${item.titular}, ${item.licenca} (${item.origem})`);
}
if (incorporadoComProblema.length > 0) {
  console.error(`\nERRO — codigo de terceiro incorporado sem aviso de licenca:\n  ${incorporadoComProblema.join("\n  ")}`);
  process.exit(1);
}

console.log("\nNenhuma licenca incompativel encontrada.");
