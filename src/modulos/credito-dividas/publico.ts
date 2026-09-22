/**
 * Interface publica do modulo "credito-dividas".
 * Dividas da empresa com terceiros. NAO tem fluxo de pagamento proprio: cada
 * parcela vira uma conta a pagar. Outros modulos importam SOMENTE daqui.
 */
/*
 * A aritmetica do cronograma (Price, SAC, conversao de taxa) vive em
 * `compartilhado/financeiro`, e nao aqui: a tela de cadastro precisa dela para
 * montar a previa, e um componente de cliente nao pode importar este arquivo
 * — ele carrega o repositorio, e com ele o driver do banco.
 */
export type {
  DadosNovaDivida,
  DividaDetalhada,
  DividaNaLista,
  PainelDeDividas,
  ParcelaDaDivida,
  ParcelaNoHorizonte,
  RepositorioDividas,
} from "./aplicacao/repositorio-dividas";
export { RepositorioDividasDrizzle } from "./infraestrutura/repositorio-dividas-drizzle";
