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
export function CascaSimples({ children }: { readonly children: ReactNode }) {
  return (
    <div className={estilos.pagina}>
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
