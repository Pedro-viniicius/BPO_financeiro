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

import { acaoCriarConta, type EstadoFormularioCriarConta } from "./acoes";

const ESTADO_INICIAL: EstadoFormularioCriarConta = {};

export function FormularioCriarConta() {
  const [estado, enviar, pendente] = useActionState(acaoCriarConta, ESTADO_INICIAL);
  const erroDe = (campo: string) => {
    const mensagem = estado.campos?.[campo]?.[0];
    return mensagem ? { erro: mensagem } : {};
  };

  return (
    <FormularioSimples action={enviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o que está marcado e envie de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="nome" rotulo="Seu nome" obrigatorio {...erroDe("nome")}>
        {(atributos) => <ControleTexto {...atributos} name="nome" type="text" autoComplete="name" autoFocus defaultValue={estado.valores?.nome ?? ""} />}
      </CampoFormulario>

      <CampoFormulario id="email" rotulo="E-mail" obrigatorio {...erroDe("email")}>
        {(atributos) => <ControleTexto {...atributos} name="email" type="email" autoComplete="email" defaultValue={estado.valores?.email ?? ""} />}
      </CampoFormulario>

      <CampoFormulario id="senha" rotulo="Senha" obrigatorio dica="Ao menos 10 caracteres." {...erroDe("senha")}>
        {(atributos) => <ControleTexto {...atributos} name="senha" type="password" autoComplete="new-password" />}
      </CampoFormulario>

      <CampoFormulario id="confirmacao" rotulo="Confirme a senha" obrigatorio {...erroDe("confirmacao")}>
        {(atributos) => <ControleTexto {...atributos} name="confirmacao" type="password" autoComplete="new-password" />}
      </CampoFormulario>

      <AcoesFormularioSimples>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Criando conta...">
          Criar conta
        </Botao>
      </AcoesFormularioSimples>
    </FormularioSimples>
  );
}
