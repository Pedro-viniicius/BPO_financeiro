"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  AcoesFormularioSimples,
  Aviso,
  Botao,
  CampoFormulario,
  ControleTexto,
  FormularioSimples,
  LigacoesFormularioSimples,
} from "@/interface/componentes/indice";

import { acaoPedirRedefinicao, type EstadoFormularioEsqueciSenha } from "./acoes";

const ESTADO_INICIAL: EstadoFormularioEsqueciSenha = {};

export function FormularioEsqueciSenha({ rotaEntrar }: { readonly rotaEntrar: string }) {
  const [estado, enviar, pendente] = useActionState(acaoPedirRedefinicao, ESTADO_INICIAL);

  // Confirmacao deliberadamente vaga: nao revela se existe conta com o e-mail.
  if (estado.enviado) {
    return (
      <>
        <Aviso tom="sucesso" titulo="Se houver uma conta com esse e-mail, o link está a caminho">
          Confira a caixa de entrada e o spam. O link vale por 30 minutos e só pode ser usado uma vez.
        </Aviso>
        <LigacoesFormularioSimples>
          <Link href={rotaEntrar}>Voltar para a entrada</Link>
        </LigacoesFormularioSimples>
      </>
    );
  }

  return (
    <FormularioSimples action={enviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Confira o endereço e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="email" rotulo="E-mail" dica="O e-mail que você usa para entrar." obrigatorio>
        {(atributos) => (
          <ControleTexto {...atributos} name="email" type="email" autoComplete="email" autoFocus defaultValue={estado.email ?? ""} />
        )}
      </CampoFormulario>

      <AcoesFormularioSimples>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Enviando...">
          Enviar link de redefinição
        </Botao>
      </AcoesFormularioSimples>

      <LigacoesFormularioSimples>
        <Link href={rotaEntrar}>Lembrei a senha</Link>
      </LigacoesFormularioSimples>
    </FormularioSimples>
  );
}
