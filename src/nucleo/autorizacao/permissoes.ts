/**
 * Catalogo de permissoes do sistema.
 *
 * Uma permissao e a menor unidade de autorizacao: "<modulo>.<acao>".
 * Papeis (ver `papeis.ts`) sao apenas conjuntos de permissoes; a verificacao
 * real e SEMPRE por permissao, nunca por nome de papel.
 *
 * Regras:
 * - Nomes em portugues, sem acento, snake_case.
 * - Adicionar permissao aqui NAO concede a ninguem: e preciso incluir em um papel.
 * - Politica: negar por padrao. O que nao esta concedido, esta negado.
 */
export const PERMISSOES = [
  // Operacao financeira
  "contas_pagar.visualizar",
  "contas_pagar.criar",
  "contas_pagar.editar",
  "contas_pagar.aprovar",
  "contas_pagar.pagar",
  "contas_pagar.cancelar",
  "contas_pagar.excluir",

  "contas_receber.visualizar",
  "contas_receber.criar",
  "contas_receber.editar",
  "contas_receber.baixar",
  "contas_receber.cancelar",
  "contas_receber.excluir",

  "cobranca.visualizar",
  "cobranca.registrar_contato",
  "cobranca.renegociar",

  "faturamento.visualizar",
  "faturamento.emitir",
  "faturamento.cancelar",

  "cadastros.visualizar",
  "cadastros.editar",

  // Tesouraria
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
   * Cancelar e separado de editar pelo mesmo motivo de
   * `contas_pagar.cancelar`: cancelar uma divida tira do fluxo de caixa todas
   * as parcelas ainda em aberto, de uma vez. E uma decisao de outra ordem que
   * corrigir uma taxa de juros.
   */
  "dividas.cancelar",

  // Controle gerencial
  "plano_contas.visualizar",
  "plano_contas.editar",
  "centros_custo.visualizar",
  "centros_custo.editar",
  "dre.visualizar",
  "dre.exportar",
  "orcamento.visualizar",
  "orcamento.editar",
  "indicadores.visualizar",

  // Captura de documentos por QR code (Gate 10)
  "captura.visualizar",
  /*
   * Conferir e separado de visualizar pelo mesmo motivo de
   * `contas_pagar.aprovar`: aprovar um documento faz nascer um titulo. E a
   * APROVACAO exige ainda `contas_pagar.criar`, verificada junto — sem isso a
   * captura viraria atalho para criar titulo sem ter permissao de criar titulo.
   */
  "captura.conferir",
  /*
   * Gerar o QR e distribuir uma credencial de ESCRITA para fora da empresa:
   * quem tem o QR envia documento para a fila sem entrar no sistema. Por isso
   * fica separada de `configuracao.gerenciar` e so o administrador a recebe.
   */
  "captura.gerenciar_qr",

  // Plataforma
  "importacao.executar",
  "exportacao.executar",
  "relatorios.visualizar",
  "analises_ia.visualizar",
  "analises_ia.perguntar",
  "integracoes.gerenciar",

  // Administracao
  "empresas.visualizar",
  "empresas.gerenciar",
  "usuarios.visualizar",
  "usuarios.gerenciar",
  "configuracao.gerenciar",
  "auditoria.visualizar",
  "lixeira.restaurar",
] as const;

export type Permissao = (typeof PERMISSOES)[number];

const conjuntoPermissoes: ReadonlySet<string> = new Set(PERMISSOES);

export function ehPermissaoConhecida(texto: string): texto is Permissao {
  return conjuntoPermissoes.has(texto);
}
