/**
 * Leitura e escrita de planilhas, sem dependencia externa.
 *
 * O projeto tem sete dependencias de producao; cada nova e superficie de
 * ataque e trabalho de atualizacao para sempre. Uma biblioteca de planilha
 * traria centenas de milhares de linhas, com historico proprio de
 * vulnerabilidades, para gerar um modelo em branco e ler um CSV.
 */
export { montarXlsx, type AbaDaPlanilha, type ValorDeCelula } from "./xlsx";
export { lerCsv, normalizarCabecalho, type LinhaDaPlanilha, type PlanilhaLida } from "./ler-csv";
