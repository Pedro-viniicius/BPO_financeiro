import estilos from "./esqueleto.module.css";

export interface EsqueletoProps {
  /** Quantas linhas de espaco reservar. O esqueleto tem a ALTURA do conteudo final. */
  readonly linhas?: number;
  readonly largura?: string;
  readonly altura?: string;
  /** O que esta carregando, para leitores de tela ("Carregando contas a pagar"). */
  readonly descricao: string;
}

/**
 * Espaco reservado durante o carregamento.
 *
 * Existe para impedir que o layout pule (docs/ux/principios-ux.md, principio 12):
 * o esqueleto ocupa o mesmo espaco que o conteudo final vai ocupar.
 */
export function Esqueleto({ linhas = 1, largura = "100%", altura = "20px", descricao }: EsqueletoProps) {
  return (
    <div className={estilos.area} role="status" aria-live="polite">
      <span className="apenas-leitor-de-tela">{descricao}</span>
      {Array.from({ length: linhas }, (_, indice) => (
        <span key={indice} className={estilos.barra} style={{ width: largura, height: altura }} aria-hidden="true" />
      ))}
    </div>
  );
}
