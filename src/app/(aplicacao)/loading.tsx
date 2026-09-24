import { Esqueleto } from "@/interface/componentes/indice";

import estilos from "./carregando.module.css";

/**
 * O que aparece enquanto uma tela do sistema carrega.
 *
 * Toda pagina daqui consulta o banco no servidor antes de renderizar — o
 * demonstrativo faz varias consultas. Sem este arquivo, clicar num item do
 * menu deixava a tela ANTERIOR congelada ate a resposta chegar: nenhum sinal
 * de que algo estava acontecendo, e nada que distinguisse "carregando" de
 * "travou". Quem nao tem certeza, clica de novo.
 *
 * O esqueleto imita a FORMA da pagina (titulo, cartoes, lista) em vez de ser
 * um circulo girando no meio da tela. Assim o conteudo real chega no lugar
 * onde o olho ja estava, e o layout nao pula quando ele chega.
 */
export default function Carregando() {
  return (
    <div className={estilos.pagina}>
      <div className={estilos.cabecalho}>
        <Esqueleto descricao="Carregando a tela" largura="14rem" altura="2rem" />
        <Esqueleto descricao="" largura="22rem" altura="1rem" />
      </div>

      <div className={estilos.cartoes} aria-hidden="true">
        {[0, 1, 2].map((indice) => (
          <div key={indice} className={estilos.cartao}>
            <Esqueleto descricao="" largura="60%" altura="0.9rem" />
            <Esqueleto descricao="" largura="45%" altura="2rem" />
            <Esqueleto descricao="" largura="85%" altura="0.8rem" />
          </div>
        ))}
      </div>

      <div className={estilos.lista} aria-hidden="true">
        <Esqueleto descricao="" linhas={6} altura="2.6rem" />
      </div>
    </div>
  );
}
