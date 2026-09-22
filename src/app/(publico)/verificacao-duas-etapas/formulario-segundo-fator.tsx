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

import { acaoVerificarSegundoFator, type EstadoFormularioSegundoFator } from "./acoes";

const ESTADO_INICIAL: EstadoFormularioSegundoFator = {};

/**
 * Codigo do aplicativo de autenticacao.
 *
 * O campo e um `<input>` unico, nao seis caixinhas: seis caixinhas quebram
 * colar o codigo, atrapalham leitor de tela e nao trazem ganho real.
 * `inputMode="numeric"` abre o teclado numerico no celular e
 * `autoComplete="one-time-code"` deixa o sistema operacional preencher.
 */
export function FormularioSegundoFator({ retorno, rotaEntrar }: { readonly retorno: string | null; readonly rotaEntrar: string }) {
  const [estado, enviar, pendente] = useActionState(acaoVerificarSegundoFator, ESTADO_INICIAL);

  return (
    <FormularioSimples action={enviar}>
      {retorno ? <input type="hidden" name="retorno" value={retorno} /> : null}

      {estado.mensagem ? (
        <Aviso tom={estado.expirado ? "informacao" : "perigo"} titulo={estado.mensagem} urgente={!estado.expirado}>
          {estado.expirado
            ? "Por segurança, a verificação vale por pouco tempo."
            : "O código muda a cada 30 segundos — confira se está usando o mais recente."}
        </Aviso>
      ) : null}

      {estado.expirado ? null : (
        <CampoFormulario
          id="codigo"
          rotulo="Código de verificação"
          dica="Os 6 dígitos mostrados no seu aplicativo de autenticação."
          obrigatorio
        >
          {(atributos) => (
            <ControleTexto
              {...atributos}
              name="codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={8}
              placeholder="000000"
            />
          )}
        </CampoFormulario>
      )}

      <AcoesFormularioSimples>
        {estado.expirado ? null : (
          <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Verificando...">
            Verificar
          </Botao>
        )}
      </AcoesFormularioSimples>

      <LigacoesFormularioSimples>
        <Link href={rotaEntrar}>{estado.expirado ? "Entrar novamente" : "Cancelar e voltar para a entrada"}</Link>
      </LigacoesFormularioSimples>
    </FormularioSimples>
  );
}
