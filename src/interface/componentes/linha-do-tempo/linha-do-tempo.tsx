import type { ReactNode } from "react";

import estilos from "./linha-do-tempo.module.css";

export interface EventoDaLinhaDoTempo {
  readonly id: string;
  /** "12/09 09:14" — data e hora ja formatadas pela camada de apresentacao. */
  readonly quando: string;
  /** Frase de negocio: "Pagamento registrado por Rafael Lima". */
  readonly descricao: string;
  /** Detalhe opcional: valor, conta, "de R$ 2.400,00 para R$ 2.380,00". */
  readonly detalhe?: ReactNode;
}

export interface LinhaDoTempoProps {
  readonly eventos: readonly EventoDaLinhaDoTempo[];
  /** Titulo acessivel da lista. */
  readonly titulo?: string;
}

/**
 * Historico de uma entidade financeira, em linguagem de negocio.
 *
 * Nunca mostra identificador tecnico, nome de tabela ou JSON: e a face visivel
 * da auditoria somente-insercao do Gate 3 (docs/ux/estados-interface.md, 9).
 */
export function LinhaDoTempo({ eventos, titulo = "Histórico" }: LinhaDoTempoProps) {
  return (
    <ol className={estilos.lista} aria-label={titulo}>
      {eventos.map((evento) => (
        <li key={evento.id} className={estilos.item}>
          <span className={estilos.marca} aria-hidden="true" />
          <div className={estilos.conteudo}>
            <time className={estilos.quando}>{evento.quando}</time>
            <p className={estilos.descricao}>{evento.descricao}</p>
            {evento.detalhe ? <div className={estilos.detalhe}>{evento.detalhe}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
