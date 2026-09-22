/**
 * Identidade da marca — o unico lugar onde o nome, a assinatura e os textos
 * institucionais do produto sao escritos.
 *
 * Para transformar este software em outra marca sao necessarios dois arquivos:
 *   1. este (nome, assinatura, sigla, contato);
 *   2. `tema-nova-didata.css` (cores, raio, sombra, tipografia).
 * Nenhum componente escreve o nome da empresa no meio do codigo.
 *
 * ATENCAO: aqui mora a identidade do CLIENTE, nunca o dominio do produto.
 * O sistema e um BPO financeiro. A Nova Didata e uma escola de cursos
 * profissionalizantes, mas isso nao entra no dominio: uma mensalidade dela e,
 * para este sistema, uma conta a receber como qualquer outra. Nada de aluno,
 * turma ou matricula — nem aqui, nem em lugar nenhum do codigo.
 */

export interface IdentidadeDaMarca {
  /** Nome completo, como aparece no cabecalho e no titulo da aba. */
  readonly nome: string;
  /** Nome curto para espacos apertados (celular, rodape). */
  readonly nomeCurto: string;
  /** Duas letras do simbolo. Usado quando a barra lateral esta compacta. */
  readonly sigla: string;
  /** Frase de uma linha que explica o negocio. */
  readonly assinatura: string;
  /** Descricao usada em metadados e na tela de entrada. */
  readonly descricao: string;
  /** Como o produto se apresenta ("Gestao financeira"). */
  readonly nomeDoProduto: string;
  /** Cidade e estado da empresa dona da instalacao. */
  readonly praca: string;
  /** Arquivo de tema aplicado em `global.css`. Trocar a marca = trocar o tema. */
  readonly arquivoDeTema: string;
}

export const MARCA: IdentidadeDaMarca = {
  nome: "Nova Didata",
  nomeCurto: "Nova Didata",
  sigla: "ND",
  assinatura: "A sua sorte é você quem faz!",
  descricao: "Gestão financeira, tesouraria e controle gerencial em um só lugar.",
  nomeDoProduto: "Financeiro",
  praca: "São Sebastião do Paraíso, MG",
  arquivoDeTema: "tema-nova-didata.css",
};

/**
 * Perguntas que dao nome as telas. Ficam aqui porque sao parte da voz da
 * marca: o produto fala por perguntas, nao por nomes de relatorio.
 *
 * Todas sao perguntas FINANCEIRAS — e o dominio do sistema que manda aqui,
 * nao o ramo do cliente.
 */
export const PERGUNTAS = {
  inicio: "Como está o caixa hoje?",
  contasPagar: "O que precisa ser pago, e quando?",
  contasReceber: "O que temos a receber, e de quem?",
  bancos: "Onde está o nosso dinheiro?",
  fluxoCaixa: "O que entra e o que sai nos próximos dias?",
  resultados: "O mês fechou positivo?",
} as const;
