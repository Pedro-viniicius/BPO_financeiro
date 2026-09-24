import { caminhoSvgDoQr, ZONA_QUIETA_QR, type MatrizQr } from "@/compartilhado/qr/indice";

import estilos from "./codigo-qr.module.css";

export interface CodigoQrProps {
  readonly matriz: MatrizQr;
  /** O que o QR abre, para leitores de tela: "QR code de envio de documentos da Nova Didata". */
  readonly rotulo: string;
}

/**
 * QR code em SVG inline, desenhado a partir da matriz de modulos.
 *
 * Preto sobre branco literal, e nao tokens de cor: aqui a cor e requisito de
 * leitura, nao desenho. A zona quieta (4 modulos) faz parte do proprio SVG,
 * para sobreviver a qualquer CSS em volta — e a impressao.
 */
export function CodigoQr({ matriz, rotulo }: CodigoQrProps) {
  const lado = matriz.tamanho + ZONA_QUIETA_QR * 2;
  return (
    <svg
      className={estilos.qr}
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={rotulo}
    >
      <rect width={lado} height={lado} fill="#fff" />
      <path d={caminhoSvgDoQr(matriz)} fill="#000" />
    </svg>
  );
}
