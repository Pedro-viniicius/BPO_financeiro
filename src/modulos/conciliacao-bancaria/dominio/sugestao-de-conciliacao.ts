import { diasEntre, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { type CategoriaErro, ErroDominio, falha, type Resultado, sucesso } from "@/compartilhado/erros/indice";

/**
 * Quem casa com quem, e com que confianca.
 *
 * A regra de negocio inteira cabe em uma frase: mesmo sentido, mesmo valor,
 * data proxima. O que exige cuidado nao e achar candidata — e o que fazer
 * quando ha MAIS DE UMA.
 *
 * Duas mensalidades de R$ 500 no mesmo dia sao indistinguiveis pelos dados do
 * extrato. Escolher uma delas automaticamente daria certo metade das vezes, e
 * o erro so apareceria meses depois, quando um cliente aparecesse como
 * inadimplente sem ser. Por isso, com duas ou mais candidatas, o sistema
 * mostra todas, marca como "revisao" e NAO escolhe.
 *
 * A mesma logica vale para o botao "aceitar todas as exatas": uma sugestao so
 * e exata quando e unica dos DOIS lados — a movimentacao tambem nao pode
 * servir para outro item. Sem isso, aceitar em lote casaria duas linhas
 * identicas na ordem em que apareceram na tela.
 *
 * Funcoes puras: nada aqui le ou grava nada.
 */

/** Os mesmos valores do enum `confianca_conciliacao` do banco. */
export type ConfiancaConciliacao = "alta" | "possivel" | "revisao";

/** Janela em que uma diferenca de data ainda e a mesma operacao (D+3 do banco). */
export const JANELA_DE_DIAS = 3;

export interface ItemParaCasar {
  readonly id: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
}

export interface MovimentacaoParaCasar {
  readonly id: string;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  readonly valor: Dinheiro;
}

export interface Candidata {
  readonly movimentacaoId: string;
  /** Negativo quando a movimentacao e anterior ao lancamento do banco. */
  readonly diferencaDeDias: number;
  readonly mesmaData: boolean;
}

export interface SugestaoDeConciliacao {
  readonly itemId: string;
  readonly candidatas: readonly Candidata[];
  readonly confianca: ConfiancaConciliacao;
  /** Verdadeiro so quando a correspondencia e unica dos dois lados e na mesma data. */
  readonly exata: boolean;
}

function combinam(item: ItemParaCasar, movimentacao: MovimentacaoParaCasar): boolean {
  return item.tipo === movimentacao.tipo && item.valor.igual(movimentacao.valor);
}

/**
 * As sugestoes para uma tela de conciliacao.
 *
 * Devolve uma entrada por item do extrato, inclusive os sem candidata — a tela
 * precisa mostrar "nenhuma correspondencia encontrada" tanto quanto mostrar as
 * candidatas.
 */
export function sugerirConciliacoes(
  itens: readonly ItemParaCasar[],
  movimentacoes: readonly MovimentacaoParaCasar[],
): readonly SugestaoDeConciliacao[] {
  const candidatasPorItem = new Map<string, Candidata[]>();

  for (const item of itens) {
    const candidatas = movimentacoes
      .filter((movimentacao) => combinam(item, movimentacao))
      .map((movimentacao) => ({
        movimentacaoId: movimentacao.id,
        diferencaDeDias: diasEntre(item.data, movimentacao.data),
        mesmaData: movimentacao.data === item.data,
      }))
      .filter((candidata) => Math.abs(candidata.diferencaDeDias) <= JANELA_DE_DIAS)
      // Mais perto da data do banco primeiro; desempate estavel pelo id.
      .sort(
        (a, b) =>
          Math.abs(a.diferencaDeDias) - Math.abs(b.diferencaDeDias) || a.movimentacaoId.localeCompare(b.movimentacaoId),
      );
    candidatasPorItem.set(item.id, candidatas);
  }

  /*
   * Quantos itens disputam cada movimentacao na MESMA data. Uma movimentacao
   * disputada nao gera sugestao exata para ninguem.
   */
  const disputasNaMesmaData = new Map<string, number>();
  for (const candidatas of candidatasPorItem.values()) {
    for (const candidata of candidatas) {
      if (!candidata.mesmaData) continue;
      disputasNaMesmaData.set(candidata.movimentacaoId, (disputasNaMesmaData.get(candidata.movimentacaoId) ?? 0) + 1);
    }
  }

  return itens.map((item) => {
    const candidatas = candidatasPorItem.get(item.id) ?? [];
    const unica = candidatas.length === 1 ? candidatas[0] : undefined;
    const exata = Boolean(unica?.mesmaData && (disputasNaMesmaData.get(unica.movimentacaoId) ?? 0) === 1);

    return {
      itemId: item.id,
      candidatas,
      confianca: classificar(candidatas, exata),
      exata,
    };
  });
}

function classificar(candidatas: readonly Candidata[], exata: boolean): ConfiancaConciliacao {
  if (candidatas.length === 0) return "revisao";
  if (candidatas.length > 1) return "revisao";
  return exata ? "alta" : "possivel";
}

// --------------------------------------------------------------- 1:N e N:1

export class ConciliacaoDesequilibrada extends ErroDominio {
  readonly codigo = "conciliacao_desequilibrada";
  readonly categoria: CategoriaErro = "regra_negocio";

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem, detalhes);
  }
}

/**
 * A conta que precisa fechar numa conciliacao com varios de um lado.
 *
 * Um deposito unico de R$ 1.000 pode liquidar dois recebimentos de R$ 500 —
 * mas so se a soma bater EXATAMENTE. Aceitar R$ 999 deixaria um centavo orfao
 * que ninguem procuraria, e o saldo do extrato deixaria de bater com o do
 * sistema sem nenhum aviso.
 *
 * O sentido tambem tem de ser o mesmo dos dois lados: nada de compensar uma
 * entrada com uma saida.
 */
export function validarConciliacao(
  itens: readonly ItemParaCasar[],
  movimentacoes: readonly MovimentacaoParaCasar[],
): Resultado<void, ConciliacaoDesequilibrada> {
  if (itens.length === 0 || movimentacoes.length === 0) {
    return falha(new ConciliacaoDesequilibrada("Escolha pelo menos um lançamento do extrato e uma movimentação."));
  }

  const sentidos = new Set([...itens.map((i) => i.tipo), ...movimentacoes.map((m) => m.tipo)]);
  if (sentidos.size > 1) {
    return falha(
      new ConciliacaoDesequilibrada("Entradas e saídas não se conciliam entre si. Selecione lançamentos do mesmo sentido."),
    );
  }

  const somaItens = Dinheiro.somarTodos(itens.map((i) => i.valor));
  const somaMovimentacoes = Dinheiro.somarTodos(movimentacoes.map((m) => m.valor));

  if (!somaItens.igual(somaMovimentacoes)) {
    return falha(
      new ConciliacaoDesequilibrada(
        `As somas precisam ser iguais: o extrato traz ${somaItens.formatarBrasileiro()} e os lançamentos selecionados somam ${somaMovimentacoes.formatarBrasileiro()}.`,
        { extrato: somaItens.paraTexto(), sistema: somaMovimentacoes.paraTexto() },
      ),
    );
  }

  return sucesso(undefined);
}

/** A confianca de uma conciliacao decidida a mao, com N de um lado. */
export function confiancaDeConciliacaoManual(itens: number, movimentacoes: number): ConfiancaConciliacao {
  return itens === 1 && movimentacoes === 1 ? "possivel" : "revisao";
}
