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

import { acaoRedefinirSenha, type EstadoFormularioRedefinir } from "./acoes";

const ESTADO_INICIAL: EstadoFormularioRedefinir = {};

export function FormularioRedefinirSenha({
  token,
  rotaEsqueciSenha,
  tamanhoMinimoSenha,
}: {
  readonly token: string;
  readonly rotaEsqueciSenha: string;
  readonly tamanhoMinimoSenha: number;
}) {
  const [estado, enviar, pendente] = useActionState(acaoRedefinirSenha, ESTADO_INICIAL);

  if (estado.linkInvalido) {
    return (
      <>
        <Aviso tom="perigo" titulo={estado.mensagem ?? "Este link não vale mais"} urgente>
          Links de redefinição valem por 30 minutos e só podem ser usados uma vez.
        </Aviso>
        <LigacoesFormularioSimples>
          <Link href={rotaEsqueciSenha}>Pedir um novo link</Link>
        </LigacoesFormularioSimples>
      </>
    );
  }

  return (
    <FormularioSimples action={enviar}>
      <input type="hidden" name="token" value={token} />

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Confira os campos e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario
        id="senha"
        rotulo="Nova senha"
        dica={`Pelo menos ${tamanhoMinimoSenha} caracteres.`}
        obrigatorio
      >
        {(atributos) => (
          <ControleTexto {...atributos} name="senha" type="password" autoComplete="new-password" autoFocus minLength={tamanhoMinimoSenha} />
        )}
      </CampoFormulario>

      <CampoFormulario id="confirmacao" rotulo="Repita a nova senha" obrigatorio>
        {(atributos) => (
          <ControleTexto {...atributos} name="confirmacao" type="password" autoComplete="new-password" minLength={tamanhoMinimoSenha} />
        )}
      </CampoFormulario>

      <Aviso tom="informacao" titulo="Ao trocar a senha, todas as sessões abertas são encerradas">
        Você vai precisar entrar de novo — e quem estiver usando a sua conta em outro lugar também perde o acesso.
      </Aviso>

      <AcoesFormularioSimples>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar nova senha
        </Botao>
      </AcoesFormularioSimples>
    </FormularioSimples>
  );
}
