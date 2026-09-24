import { PERMISSOES, type Permissao } from "./permissoes";

/**
 * Papeis iniciais. Um papel e um conjunto nomeado de permissoes.
 *
 * Os papeis existem para facilitar a administracao ("essa pessoa e do
 * financeiro"), mas o sistema verifica permissoes, nao papeis. Vinculos podem
 * ainda receber `permissoes_extras` e `permissoes_removidas` (ver
 * `nucleo/empresas`), o que permite ajustes finos sem criar papeis novos.
 */
export const PAPEIS = [
  "administrador",
  "financeiro",
  "tesouraria",
  "controladoria",
  "auditor",
  "somente_leitura",
] as const;

export type Papel = (typeof PAPEIS)[number];

/** Nome para exibicao ao usuario. */
export const NOMES_PAPEIS: Record<Papel, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  tesouraria: "Tesouraria",
  controladoria: "Controladoria",
  auditor: "Auditor",
  somente_leitura: "Somente leitura",
};

const todasVisualizacoes = PERMISSOES.filter((permissao) => permissao.endsWith(".visualizar"));

const operacaoFinanceira: Permissao[] = [
  "contas_pagar.visualizar",
  "contas_pagar.criar",
  "contas_pagar.editar",
  "contas_pagar.pagar",
  "contas_pagar.cancelar",
  "contas_receber.visualizar",
  "contas_receber.criar",
  "contas_receber.editar",
  "contas_receber.baixar",
  "contas_receber.cancelar",
  "cobranca.visualizar",
  "cobranca.registrar_contato",
  "cobranca.renegociar",
  "faturamento.visualizar",
  "faturamento.emitir",
  "cadastros.visualizar",
  "cadastros.editar",
  "bancos.visualizar",
  "bancos.importar_extrato",
  "bancos.conciliar",
  "caixa.visualizar",
  "caixa.movimentar",
  "fluxo_caixa.visualizar",
  "importacao.executar",
  "exportacao.executar",
  "relatorios.visualizar",
  /*
   * E o papel que tem `contas_pagar.criar`, entao e quem confere a fila de
   * documentos capturados. Tesouraria NAO ve a fila: documento pendente nao
   * foi conferido, nao serve para previsao, e ela ve a conta quando nasce.
   */
  "captura.visualizar",
  "captura.conferir",
];

const tesouraria: Permissao[] = [
  "contas_pagar.visualizar",
  "contas_pagar.aprovar",
  "contas_pagar.pagar",
  "contas_receber.visualizar",
  "bancos.visualizar",
  "bancos.editar",
  "bancos.importar_extrato",
  "bancos.conciliar",
  "caixa.visualizar",
  "caixa.movimentar",
  "fluxo_caixa.visualizar",
  "previsao.visualizar",
  "previsao.editar_premissas",
  "dividas.visualizar",
  "dividas.editar",
  /*
   * Quem edita divida tambem cancela, como em contas a pagar, onde `editar` e
   * `cancelar` andam juntos no papel de operacao financeira. Nao vai para o
   * papel `financeiro` porque ele nao tem nem `dividas.visualizar`: conceder
   * o cancelamento de algo que o papel nao enxerga seria permissao morta.
   */
  "dividas.cancelar",
  "indicadores.visualizar",
  "relatorios.visualizar",
  "exportacao.executar",
];

const controladoria: Permissao[] = [
  ...todasVisualizacoes,
  "plano_contas.editar",
  "centros_custo.editar",
  "dre.exportar",
  "orcamento.editar",
  "exportacao.executar",
  "analises_ia.perguntar",
];

const auditor: Permissao[] = [...todasVisualizacoes, "dre.exportar", "exportacao.executar"];

/*
 * `captura.visualizar` sai daqui de proposito: a fila de captura nao e
 * relatorio, e documento bruto de terceiro — imagem de nota com CPF, CNPJ e
 * endereco, antes de qualquer conferencia. Este papel existe para quem
 * acompanha numeros, nao para quem manuseia documento fiscal alheio.
 */
const somenteLeitura: Permissao[] = todasVisualizacoes.filter(
  (permissao) =>
    permissao !== "auditoria.visualizar" &&
    permissao !== "usuarios.visualizar" &&
    permissao !== "captura.visualizar",
);

export const PERMISSOES_POR_PAPEL: Record<Papel, ReadonlySet<Permissao>> = {
  administrador: new Set(PERMISSOES),
  financeiro: new Set(operacaoFinanceira),
  tesouraria: new Set(tesouraria),
  controladoria: new Set(controladoria),
  auditor: new Set(auditor),
  somente_leitura: new Set(somenteLeitura),
};

export function ehPapelConhecido(texto: string): texto is Papel {
  return (PAPEIS as readonly string[]).includes(texto);
}
