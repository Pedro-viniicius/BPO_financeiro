import Image from "next/image";

import { MARCA } from "./identidade";
import estilos from "./logotipo.module.css";

export interface LogotipoProps {
  readonly tamanho?: "pequeno" | "normal" | "grande";
  /** Mostra a assinatura da marca abaixo do nome. */
  readonly comAssinatura?: boolean;
}

const MEDIDAS: Record<NonNullable<LogotipoProps["tamanho"]>, number> = {
  pequeno: 22,
  normal: 28,
  grande: 40,
};

/**
 * Simbolo + nome da marca, para espacos apertados (cabecalho, barra lateral).
 *
 * O simbolo e SVG inline e as cores vem de tokens, entao ele acompanha
 * automaticamente uma troca de tema e fica nitido em qualquer tamanho. Onde a
 * marca precisa aparecer inteira — a tela de entrada, por exemplo — use
 * `LogotipoOficial`, que mostra a arte original.
 *
 * A forma ecoa a marca da Nova Didata: o "D" com o miolo vazado.
 */
export function Logotipo({ tamanho = "normal", comAssinatura = false }: LogotipoProps) {
  const medida = MEDIDAS[tamanho];

  return (
    <span className={`${estilos.logotipo} ${estilos[tamanho]}`}>
      <svg
        className={estilos.simbolo}
        width={medida}
        height={medida}
        viewBox="0 0 40 40"
        role="img"
        aria-label={`Símbolo da ${MARCA.nome}`}
      >
        <rect width="40" height="40" rx="11" fill="var(--cor-marca-forte)" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 9h9c7 0 11 4.8 11 11s-4 11-11 11h-9V9Zm6.5 6v10H21c3.3 0 5-2 5-5s-1.7-5-5-5h-2.5Z"
          fill="var(--cor-marca-contraste)"
        />
      </svg>
      <span className={estilos.textos}>
        <span className={estilos.nome}>{MARCA.nome}</span>
        {comAssinatura ? <span className={estilos.assinatura}>{MARCA.assinatura}</span> : null}
      </span>
    </span>
  );
}

/** Medidas reais do arquivo em `public/marca/`, para nao haver salto de layout. */
const ARTE = { caminho: "/marca/nova-didata.png", largura: 788, altura: 323 } as const;

/**
 * A arte original da marca, com nome e assinatura ja desenhados.
 *
 * Usada onde a identidade precisa ser reconhecida de imediato — a tela de
 * entrada e o primeiro acesso. E uma imagem, entao nao acompanha troca de
 * tema; e exatamente por isso que o cabecalho usa `Logotipo`.
 */
export function LogotipoOficial({ largura = 200 }: { readonly largura?: number }) {
  return (
    <Image
      className={estilos.arte}
      src={ARTE.caminho}
      alt={`${MARCA.nome} — ${MARCA.assinatura}`}
      width={largura}
      height={Math.round((largura * ARTE.altura) / ARTE.largura)}
      priority
    />
  );
}
