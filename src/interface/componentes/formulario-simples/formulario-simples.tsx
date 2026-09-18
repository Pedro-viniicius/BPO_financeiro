import type { InputHTMLAttributes, ReactNode } from "react";

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

export function FormularioSimples(props: { readonly action: (formulario: FormData) => void; readonly children: ReactNode }) {
  return (
    <form action={props.action} className={estilos.formulario} noValidate>
      {props.children}
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
