/**
 * Sistema de design: ponto unico de entrada dos componentes de interface.
 *
 * Regra desta pasta (verificada por `pnpm verificar:arquitetura`): nenhum
 * componente aqui conhece modulo de negocio, banco de dados ou nucleo.
 * Eles recebem dados ja prontos da camada de apresentacao. Ver ADR-024.
 */
export { Aviso, type AvisoProps } from "./aviso/aviso";
export { BarraFiltros, type BarraFiltrosProps, type FichaDeFiltro } from "./barra-filtros/barra-filtros";
export { Botao, type BotaoProps, type VarianteBotao } from "./botao/botao";
export { CabecalhoPagina, type CabecalhoPaginaProps } from "./cabecalho-pagina/cabecalho-pagina";
export { CampoDinheiro, type CampoDinheiroProps } from "./campo-dinheiro/campo-dinheiro";
export { CampoFormulario, type AtributosDoControle, type CampoFormularioProps } from "./campo-formulario/campo-formulario";
export { CartaoResumo, type CartaoResumoProps } from "./cartao-resumo/cartao-resumo";
export { DialogoConfirmacao, type DialogoConfirmacaoProps } from "./dialogo-confirmacao/dialogo-confirmacao";
export { Esqueleto, type EsqueletoProps } from "./esqueleto/esqueleto";
export {
  AcoesFormularioSimples,
  ControleTexto,
  FormularioSimples,
  LigacoesFormularioSimples,
  TituloFormularioSimples,
} from "./formulario-simples/formulario-simples";
export { EstadoVazio, type EstadoVazioProps } from "./estado-vazio/estado-vazio";
export { Gaveta, type GavetaProps } from "./gaveta/gaveta";
export { LinhaDoTempo, type EventoDaLinhaDoTempo, type LinhaDoTempoProps } from "./linha-do-tempo/linha-do-tempo";
export { SecaoFormulario, type SecaoFormularioProps } from "./secao-formulario/secao-formulario";
export { SeletorEntidade, type OpcaoEntidade, type SeletorEntidadeProps } from "./seletor-entidade/seletor-entidade";
export { SeloSituacao, type SeloSituacaoProps, type TomSemantico } from "./selo-situacao/selo-situacao";
export {
  TabelaDados,
  type AlinhamentoColuna,
  type ColunaTabela,
  type OrdenacaoTabela,
  type TabelaDadosProps,
} from "./tabela-dados/tabela-dados";
export { ValorFinanceiro, type ValorFinanceiroProps } from "./valor-financeiro/valor-financeiro";
