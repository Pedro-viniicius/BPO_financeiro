import type { FormEventHandler, InputHTMLAttributes, ReactNode, Ref } from "react";

import estilos from "./formulario-simples.module.css";

/**
 * Pecas das telas de uma coluna (entrar, criar conta, primeiro acesso):
 * titulo com descricao, o formulario, o campo de texto e a area de acoes.
 * Nada aqui conhece sessao ou empresa; sao so blocos visuais.
 */

export function TituloFormularioSimples({ titulo, descricao }: { readonly titulo: string; readonly descricao?: string }) {
  return (
    <div className={estilos.titulo}>
      <h1>{titulo}</h1>
      {descricao ? <p className={estilos.descricao}>{descricao}</p> : null}
    </div>
  );
}

/**
 * `ref` e `onSubmit` sao opcionais e existem para a guarda do formulario
 * (`useGuardaDoFormulario`): quem usa a guarda repassa o que ela devolve, e o
 * que foi digitado volta aos campos quando o servidor recusa o envio.
 */
export function FormularioSimples({
  action,
  children,
  ref,
  onSubmit,
}: {
  readonly action: (formulario: FormData) => void;
  readonly children: ReactNode;
  readonly ref?: Ref<HTMLFormElement>;
  readonly onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form action={action} ref={ref} onSubmit={onSubmit} className={estilos.formulario} noValidate>
      {children}
    </form>
  );
}

export function ControleTexto(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={estilos.controle} />;
}

export function AcoesFormularioSimples({ children }: { readonly children: ReactNode }) {
  return <div className={estilos.acoes}>{children}</div>;
}

export function LigacoesFormularioSimples({ children }: { readonly children: ReactNode }) {
  return <p className={estilos.ligacoes}>{children}</p>;
}
