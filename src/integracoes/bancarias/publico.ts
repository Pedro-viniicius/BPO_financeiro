/** Interface publica das integracoes bancarias: apenas contratos. */
export type {
  ContaBancariaExterna,
  MovimentacaoBancariaExterna,
  PeriodoConsulta,
  ProvedorBancario,
} from "./contratos/provedor-bancario";
export type { ExtratoLido, FormatoExtrato, LeitorExtrato } from "./contratos/leitor-extrato";
