"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Aviso, Botao } from "@/interface/componentes/indice";

import estilos from "./erro.module.css";

/**
 * O que aparece quando uma tela do sistema falha.
 *
 * Sem este arquivo, o Next.js mostra a propria pagina generica — "A server
 * error occurred. Reload to try again." —, que nao diz o que houve, nao diz o
 * que fazer e nao oferece caminho de volta. Em um sistema financeiro isso e
 * pior do que parece: quem estava dando uma baixa nao sabe se ela foi
 * registrada ou nao.
 *
 * O texto responde as tres perguntas do principio de recuperacao de erro: o
 * que aconteceu, o que provavelmente causou, e o que fazer agora. E NAO mostra
 * pilha, SQL nem nome de tabela — isso vai para o log do servidor, nao para a
 * tela de quem usa.
 *
 * O `digest` e a unica coisa tecnica exibida, e de proposito: e um codigo curto
 * que o Next.js gera para ESTE erro, e e o que liga o que a pessoa viu ao que
 * o log registrou. Sem ele, "deu erro ontem de manha" e tudo o que o suporte
 * recebe.
 */
export default function Erro({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // O console do navegador e o unico lugar em que o detalhe aparece para
    // quem estiver depurando; o servidor ja registrou o erro completo.
    console.error("Falha ao montar a tela:", error);
  }, [error]);

  return (
    <div className={estilos.pagina}>
      <Aviso tom="perigo" titulo="Não conseguimos carregar esta tela" urgente>
        <p>
          O problema foi ao buscar as informações, não no que você fez. <strong>Nenhum lançamento foi alterado</strong>{" "}
          por causa desta falha.
        </p>
        <p>
          Quase sempre é uma instabilidade momentânea de conexão com o banco de dados. Tentar de novo costuma
          resolver.
        </p>
      </Aviso>

      <div className={estilos.acoes}>
        <Botao type="button" variante="primario" onClick={reset}>
          Tentar de novo
        </Botao>
        <Link className="acao-secundaria" href="/inicio">
          Voltar para o início
        </Link>
      </div>

      <p className={estilos.ajuda}>
        Se continuar acontecendo, avise o suporte e informe este código
        {error.digest ? (
          <>
            :{" "}
            <code className={estilos.codigo}>{error.digest}</code>
          </>
        ) : (
          " e o horário em que aconteceu."
        )}
      </p>
    </div>
  );
}
