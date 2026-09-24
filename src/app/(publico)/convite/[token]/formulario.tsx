"use client";

import { useActionState } from "react";

import {
  AcoesFormularioSimples,
  Aviso,
  Botao,
  CampoFormulario,
  ControleTexto,
  FormularioSimples,
  TituloFormularioSimples,
} from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";
import { acaoAceitarConvite, type EstadoConvite } from "./acoes";

const INICIAL: EstadoConvite = {};

/**
 * Onde a pessoa define a PROPRIA senha.
 *
 * O e-mail aparece so para leitura: e ele que o convite autoriza, e deixar o
 * campo editavel abriria a porta para usar um link alheio com outro endereco.
 */
export function FormularioConvite({
  token,
  email,
  papel,
  nomeDaEmpresa,
  jaTemConta,
  dicaSenha,
}: {
  readonly token: string;
  readonly email: string;
  readonly papel: string;
  readonly nomeDaEmpresa: string;
  readonly jaTemConta: boolean;
  /*
   * Vem pronta do servidor. Importar de `nucleo/autenticacao/publico` aqui
   * arrastaria `next/headers` para um componente de cliente — o mesmo tipo de
   * vazamento que o `publico.ts` das dividas causou com o driver do banco.
   */
  readonly dicaSenha: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoAceitarConvite, INICIAL);
  const guarda = useGuardaDoFormulario(estado);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  return (
    <FormularioSimples action={enviar} {...guarda}>
      <TituloFormularioSimples
        titulo={jaTemConta ? "Definir uma nova senha" : "Criar seu acesso"}
        descricao={
          jaTemConta
            ? `Você já tem conta em ${nomeDaEmpresa}. Escolha uma senha nova; as sessões abertas serão encerradas.`
            : `Você foi convidado para ${nomeDaEmpresa} como ${papel}.`
        }
      />

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>Corrija e tente de novo.</Aviso>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <CampoFormulario id="email" rotulo="E-mail" dica="É o endereço que recebeu o convite e não pode ser alterado.">
        {(a) => <ControleTexto {...a} name="emailVisivel" type="email" value={email} readOnly />}
      </CampoFormulario>

      <CampoFormulario id="nome" rotulo="Seu nome" obrigatorio {...erro("nome")}>
        {(a) => <ControleTexto {...a} name="nome" type="text" autoComplete="name" />}
      </CampoFormulario>

      <CampoFormulario id="senha" rotulo="Senha" dica={dicaSenha} obrigatorio {...erro("senha")}>
        {(a) => <ControleTexto {...a} name="senha" type="password" autoComplete="new-password" />}
      </CampoFormulario>

      <CampoFormulario id="confirmacao" rotulo="Repita a senha" obrigatorio {...erro("confirmacao")}>
        {(a) => <ControleTexto {...a} name="confirmacao" type="password" autoComplete="new-password" />}
      </CampoFormulario>

      <AcoesFormularioSimples>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Concluindo...">
          {jaTemConta ? "Salvar nova senha" : "Criar acesso"}
        </Botao>
      </AcoesFormularioSimples>
    </FormularioSimples>
  );
}
