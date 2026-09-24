import type { ReactNode } from "react";

import { MARCA } from "../marca/identidade";
import { LogotipoOficial } from "../marca/logotipo";
import estilos from "./casca-simples.module.css";

/**
 * Casca das telas fora da aplicacao (entrar, criar conta, primeiro acesso,
 * redefinicao de senha, segundo fator).
 *
 * Composicao: a marca fica ACIMA do cartao, nao dentro dele. Assim o cartao
 * guarda so a tarefa — titulo, campos e acao — e a identidade emoldura a
 * pagina sem disputar atencao com o formulario. Abaixo, uma linha discreta
 * lembra o que o sistema e: um BPO financeiro, nao o site da empresa.
 */
export function CascaSimples({
  children,
  aviso,
}: {
  readonly children: ReactNode;
  /**
   * Faixa de ambiente, quando NAO e producao. Vem pronta de `app/`.
   *
   * Ela precisa estar AQUI, e nao so na casca autenticada, porque e nesta
   * tela que a pessoa CHEGA. Quem abre a demonstracao ve "Criar a primeira
   * conta" e comeca a usar; se o aviso so aparecesse depois de entrar, ele
   * chegaria tarde.
   */
  readonly aviso?: { readonly rotulo: string; readonly explicacao: string };
}) {
  return (
    <div className={estilos.pagina}>
      {aviso ? (
        <p className={estilos.faixaAmbiente} role="status">
          <strong>{aviso.rotulo}</strong> <span>{aviso.explicacao}</span>
        </p>
      ) : null}
      <div className={estilos.coluna}>
        <header className={estilos.marca}>
          <LogotipoOficial largura={200} />
        </header>

        <main id="conteudo" className={estilos.cartao}>
          {children}
        </main>

        <p className={estilos.rodape}>
          {MARCA.nomeDoProduto} · gestão financeira, tesouraria e controle gerencial
        </p>
      </div>
    </div>
  );
}
