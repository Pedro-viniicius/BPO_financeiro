"use client";

import { useActionState } from "react";

import {
  AcoesFormularioSimples,
  Aviso,
  Botao,
  CampoFormulario,
  ControleTexto,
  FormularioSimples,
} from "@/interface/componentes/indice";

import { acaoEntrar, type EstadoFormularioEntrar } from "./acoes";

const ESTADO_INICIAL: EstadoFormularioEntrar = {};

export function FormularioEntrar({ retorno, sessaoExpirada }: { readonly retorno: string | null; readonly sessaoExpirada: boolean }) {
  const [estado, enviar, pendente] = useActionState(acaoEntrar, ESTADO_INICIAL);

  return (
    <FormularioSimples action={enviar}>
      {retorno ? <input type="hidden" name="retorno" value={retorno} /> : null}

      {sessaoExpirada && !estado.mensagem ? (
        <Aviso tom="informacao" titulo="Sua sessão expirou">
          Entre de novo para continuar de onde parou.
        </Aviso>
      ) : null}

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Confira os dados e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="email" rotulo="E-mail" obrigatorio>
        {(atributos) => (
          <ControleTexto {...atributos} name="email" type="email" autoComplete="email" autoFocus defaultValue={estado.email ?? ""} />
        )}
      </CampoFormulario>

      <CampoFormulario id="senha" rotulo="Senha" obrigatorio>
        {(atributos) => <ControleTexto {...atributos} name="senha" type="password" autoComplete="current-password" />}
      </CampoFormulario>

      <AcoesFormularioSimples>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Entrando...">
          Entrar
        </Botao>
      </AcoesFormularioSimples>
    </FormularioSimples>
  );
}
