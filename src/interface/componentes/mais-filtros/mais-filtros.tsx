import type { ReactNode } from "react";

import estilos from "./mais-filtros.module.css";

export interface MaisFiltrosProps {
  /**
   * Quantos destes filtros estao aplicados agora. Aparece no gatilho, em
   * destaque: filtro escondido sem aviso e lista que "perdeu" linhas.
   */
  readonly ativos: number;
  /** Os controles secundarios (situacao, periodo, pessoa...). A busca fica fora. */
  readonly children: ReactNode;
}

/**
 * Os filtros secundarios de uma lista, recolhidos no celular.
 *
 * O PROBLEMA. No celular, busca, situacao, duas datas e pessoa ocupavam uns
 * 300px antes da primeira conta. Em Contas a pagar, com o resumo acima, a
 * lista comecava no rodape da tela: quem abria para ver o que vence hoje
 * nao via conta nenhuma sem rolar.
 *
 * A DECISAO. No celular, a busca fica a vista e o resto vai para "Mais
 * filtros". Com filtro aplicado o grupo continua fechado, para a lista nao
 * voltar ao rodape, e o gatilho diz quantos estao ativos, em destaque, ao
 * lado do "Limpar". No computador, onde cabe tudo numa linha, os campos
 * continuam sempre visiveis e o gatilho some. E `<details>` de verdade, como a Dobra:
 * abre e fecha sem JavaScript, com teclado, e anuncia o estado sozinho —
 * a lista funciona inteira como formulario GET, sem script.
 *
 * Navegador sem suporte a `::details-content` mostra o gatilho tambem no
 * computador. Perde a linha unica, mas nenhum filtro fica inalcancavel.
 */
export function MaisFiltros({ ativos, children }: MaisFiltrosProps) {
  return (
    <details className={estilos.grupo}>
      <summary className={ativos > 0 ? `${estilos.gatilho} ${estilos.gatilhoAtivo}` : estilos.gatilho}>
        Mais filtros
        {/* So o numero a vista, para caber ao lado de "Filtrar" e "Limpar" num celular de 390px. */}
        {ativos > 0 ? (
          <span className={estilos.contagem}>
            {ativos}
            <span className="apenas-leitor-de-tela"> {ativos === 1 ? "ativo" : "ativos"}</span>
          </span>
        ) : null}
      </summary>
      <div className={estilos.campos}>{children}</div>
    </details>
  );
}
