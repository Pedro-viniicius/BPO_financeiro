"use client";

import { useEffect } from "react";

import { Aviso, Botao } from "@/interface/componentes/indice";

/**
 * Falha nas telas de ENTRADA (entrar, criar conta, convite, redefinir senha).
 *
 * Separada da tela de erro do sistema por uma razao pratica: aqui a pessoa
 * ainda nao entrou, entao "voltar para o inicio" nao existe como saida, e ela
 * pode estar tentando justamente recuperar o proprio acesso. O texto precisa
 * deixar claro que a senha dela continua valendo — senao a reacao natural e
 * tentar redefinir a senha por causa de uma falha que nao tinha nada a ver
 * com isso.
 */
export default function ErroPublico({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha na tela de entrada:", error);
  }, [error]);

  return (
    <>
      <Aviso tom="perigo" titulo="Não conseguimos carregar esta página" urgente>
        <p>
          A falha foi nossa, ao carregar a tela. <strong>Sua senha e seu acesso continuam válidos.</strong>
        </p>
        <p>Tente de novo em alguns instantes.</p>
      </Aviso>

      <p>
        <Botao type="button" variante="primario" onClick={reset}>
          Tentar de novo
        </Botao>
      </p>

      {error.digest ? (
        <p>
          Se persistir, informe este código ao suporte: <code>{error.digest}</code>
        </p>
      ) : null}
    </>
  );
}
