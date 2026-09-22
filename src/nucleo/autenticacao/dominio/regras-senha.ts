/**
 * Regras de senha da instalacao — fonte unica.
 *
 * O numero aparecia em quatro lugares (configuracao do Better Auth, validacao
 * do cadastro, dica na tela e redefinicao). Quatro lugares significam quatro
 * chances de divergir, e divergir aqui vira "a tela aceitou mas o servidor
 * recusou". Todos leem daqui.
 */

export const TAMANHO_MINIMO_SENHA = 10;
export const TAMANHO_MAXIMO_SENHA = 128;

/** Frase usada como dica nos formularios e nas mensagens de erro. */
export const DICA_SENHA = `Ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
