import type { ReactNode } from "react";

import estilos from "./campo-formulario.module.css";

export interface CampoFormularioProps {
  /** Identificador do controle; usado no `for` do rotulo e nos `aria-*`. */
  readonly id: string;
  readonly rotulo: string;
  readonly obrigatorio?: boolean;
  /** Dica de formato ou de significado, exibida abaixo do rotulo. */
  readonly dica?: string;
  /** Mensagem de erro; quando presente o campo fica marcado como invalido. */
  readonly erro?: string;
  /** Aviso que NAO impede salvar (duplicidade provavel, fim de semana...). */
  readonly aviso?: string;
  /**
   * Recebe os atributos que o controle deve aplicar em si mesmo. Isso garante
   * que `aria-describedby` e `aria-invalid` nunca sejam esquecidos.
   */
  readonly children: (atributos: AtributosDoControle) => ReactNode;
}

export interface AtributosDoControle {
  readonly id: string;
  readonly "aria-describedby": string | undefined;
  readonly "aria-invalid": boolean | undefined;
  readonly required: boolean;
}

/**
 * Envelope padrao de campo de formulario: rotulo real, dica, erro e aviso,
 * todos ligados ao controle pelos atributos corretos.
 *
 * O rotulo NUNCA e substituido por placeholder (docs/ux/formularios.md, 12).
 */
export function CampoFormulario({
  id,
  rotulo,
  obrigatorio = false,
  dica,
  erro,
  aviso,
  children,
}: CampoFormularioProps) {
  const idDica = dica ? `${id}-dica` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const idAviso = aviso ? `${id}-aviso` : undefined;
  const descricao = [idDica, idErro, idAviso].filter(Boolean).join(" ");

  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
        {obrigatorio ? <span className={estilos.obrigatorio}> (obrigatório)</span> : null}
      </label>
      {dica ? (
        <p id={idDica} className={estilos.dica}>
          {dica}
        </p>
      ) : null}
      {children({
        id,
        "aria-describedby": descricao === "" ? undefined : descricao,
        "aria-invalid": erro ? true : undefined,
        required: obrigatorio,
      })}
      {erro ? (
        <p id={idErro} className={estilos.erro}>
          <span aria-hidden="true">✕ </span>
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p id={idAviso} className={estilos.aviso}>
          <span aria-hidden="true">! </span>
          {aviso}
        </p>
      ) : null}
    </div>
  );
}
