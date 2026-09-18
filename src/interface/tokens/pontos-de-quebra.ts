/**
 * Pontos de quebra da interface, em pixels.
 *
 * Os mesmos valores estao comentados em `tokens.css`. Eles precisam existir em
 * TypeScript porque custom properties do CSS nao funcionam dentro de `@media`;
 * este arquivo e a referencia para testes e para logica pontual de layout.
 *
 * Estrategia: desktop primeiro (ver docs/ux/responsividade.md).
 */
export const PONTOS_DE_QUEBRA = {
  /** Ate este valor (inclusive) a interface e tratada como celular. */
  celularMaximo: 767,
  /** A partir daqui a barra lateral aparece em modo compacto. */
  tablet: 768,
  /** A partir daqui a barra lateral fica expandida e fixa. */
  desktop: 1024,
  /** A partir daqui o conteudo ganha colunas adicionais. */
  largo: 1440,
} as const;

export type NomePontoDeQuebra = keyof typeof PONTOS_DE_QUEBRA;

/** Faixa de largura em que a interface esta sendo usada. */
export type FaixaDeTela = "celular" | "tablet" | "desktop" | "largo";

/** Classifica uma largura de viewport em uma das quatro faixas. */
export function faixaDaLargura(larguraEmPixels: number): FaixaDeTela {
  if (larguraEmPixels >= PONTOS_DE_QUEBRA.largo) return "largo";
  if (larguraEmPixels >= PONTOS_DE_QUEBRA.desktop) return "desktop";
  if (larguraEmPixels >= PONTOS_DE_QUEBRA.tablet) return "tablet";
  return "celular";
}
