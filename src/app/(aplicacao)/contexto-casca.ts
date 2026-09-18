import { obterSessaoAtual } from "@/nucleo/autenticacao/publico";
import { NOMES_PAPEIS, resolverPermissoesEfetivas, type Papel, type Permissao } from "@/nucleo/autorizacao/publico";

/** Tudo o que a casca precisa para se desenhar; nada de sessao crua. */
export interface ContextoDaCasca {
  readonly nomeDaEmpresa: string;
  readonly nomeDoUsuario: string;
  readonly papel: Papel;
  readonly papelDoUsuario: string;
  readonly permissoes: ReadonlySet<Permissao>;
}

/**
 * Monta o contexto da casca a partir da sessao.
 *
 * PROVISORIO (Gate 4): ainda nao existe vinculo usuario -> empresa nem tela
 * de entrada. Sem sessao, a casca e desenhada para um "Visitante" com o papel
 * de administrador, para que a interface possa ser vista e revisada. O Gate 5
 * (Fundacao) substitui isto por: exigir sessao, escolher a empresa ativa e
 * resolver as permissoes do vinculo real.
 */
export async function obterContextoDaCasca(): Promise<ContextoDaCasca> {
  // Sem `catch`: engolir o erro aqui faria o Next pre-renderizar a casca como
  // estatica (com "Visitante") e ela nunca refletiria a sessao real.
  const sessao = await obterSessaoAtual();
  const papel: Papel = "administrador";
  return {
    nomeDaEmpresa: "Empresa de demonstração",
    nomeDoUsuario: sessao?.nome ?? "Visitante",
    papel,
    papelDoUsuario: NOMES_PAPEIS[papel],
    permissoes: resolverPermissoesEfetivas(papel),
  };
}
