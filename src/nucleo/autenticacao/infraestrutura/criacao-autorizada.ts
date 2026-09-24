import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A marca "esta criacao de conta ja foi autorizada".
 *
 * Em producao o cadastro publico fecha depois do primeiro usuario, e a unica
 * porta que sobra e o convite. O convite e validado pelo TOKEN, em
 * `aceitarConvite`, que entao pede a conta ao Better Auth por
 * `criarUsuarioComSenha`. O gancho `user.create.before` da biblioteca roda
 * dentro dessa chamada e precisa distinguir "veio do convite" de "veio da
 * rota publica de cadastro".
 *
 * A distincao nao pode ser pelo e-mail: "existe convite pendente para este
 * e-mail" e uma pergunta que qualquer pessoa na internet consegue fazer a
 * rota publica, e quem soubesse um e-mail convidado criaria a conta antes
 * do convidado, com a propria senha. A marca vive num `AsyncLocalStorage`:
 * so o codigo do servidor consegue liga-la, e ela acompanha a cadeia de
 * `await` ate o gancho, sem passar por cabecalho nem por corpo de requisicao.
 */
export interface MarcaDeCriacaoAutorizada {
  readonly porConvite: true;
}

export const criacaoAutorizada = new AsyncLocalStorage<MarcaDeCriacaoAutorizada>();

/**
 * A regra do gancho, isolada da biblioteca para ser testavel:
 *
 * - criacao marcada como autorizada (convite ja validado pelo token) → segue;
 * - cadastro aberto (instalacao vazia, ou fora de producao) → segue;
 * - qualquer outro caso → recusa. Nao ha "mas o e-mail tem convite".
 */
export function podeCriarUsuario(marca: MarcaDeCriacaoAutorizada | undefined, cadastroAberto: boolean): boolean {
  if (marca?.porConvite) return true;
  return cadastroAberto;
}
