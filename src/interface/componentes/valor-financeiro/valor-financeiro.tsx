import { descreverValorParaLeitorDeTela, formatarDinheiro, type EstiloDeSinal } from "@/interface/formatacao/indice";

import estilos from "./valor-financeiro.module.css";

export interface ValorFinanceiroProps {
  /** Valor no formato canonico do dominio: "1234.56", "-90.00". */
  readonly valor: string;
  /** Como o sinal aparece. Padrao: "natural" (so o negativo). */
  readonly estiloDeSinal?: EstiloDeSinal;
  /** Tamanho na hierarquia da pagina. */
  readonly tamanho?: "pequeno" | "normal" | "grande" | "destaque";
  /** Quando falso, o valor nao recebe cor semantica (util dentro de tabelas neutras). */
  readonly comCor?: boolean;
  /** Rotulo lido antes do valor por leitores de tela ("Saldo disponível"). */
  readonly rotuloAcessivel?: string;
}

/**
 * Exibe um valor monetario ja calculado pelo dominio.
 *
 * Caracteristicas obrigatorias (docs/ux/principios-ux.md, principio 8):
 * - algarismos de largura fixa, para comparacao vertical;
 * - alinhamento a direita quando dentro de tabela;
 * - o sinal e sempre textual — a cor e apenas reforco.
 */
export function ValorFinanceiro({
  valor,
  estiloDeSinal = "natural",
  tamanho = "normal",
  comCor = true,
  rotuloAcessivel,
}: ValorFinanceiroProps) {
  const formatado = formatarDinheiro(valor, estiloDeSinal);
  const classes = [
    estilos.valor,
    estilos[tamanho],
    comCor ? estilos[formatado.tom] : estilos.semCor,
  ].join(" ");

  return (
    <span className={classes}>
      {rotuloAcessivel ? <span className="apenas-leitor-de-tela">{rotuloAcessivel}: </span> : null}
      <span aria-hidden="true">{formatado.texto}</span>
      <span className="apenas-leitor-de-tela">{descreverValorParaLeitorDeTela(valor)}</span>
    </span>
  );
}
