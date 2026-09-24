import type { Credenciais, UsuarioDeAutenticacao } from "../aplicacao/credenciais";
import { obterAutenticacao } from "./better-auth";
import { criacaoAutorizada } from "./criacao-autorizada";

/**
 * Credenciais pelo contexto do proprio Better Auth.
 *
 * Usa `password.hash` e o adaptador interno da biblioteca de proposito: um
 * hash calculado por fora produziria senha que o login nao reconhece, e uma
 * sessao apagada por fora deixaria o cache da biblioteca desatualizado.
 */
export class CredenciaisBetterAuth implements Credenciais {
  private async contexto() {
    return obterAutenticacao().$context;
  }

  async buscarPorEmail(email: string): Promise<UsuarioDeAutenticacao | null> {
    const ctx = await this.contexto();
    const usuario = await ctx.internalAdapter.findUserByEmail(email.toLowerCase());
    if (!usuario?.user) return null;
    return { id: usuario.user.id, nome: usuario.user.name, email: usuario.user.email };
  }

  /**
   * Cria a conta pela API de cadastro da biblioteca, chamada DIRETO (sem HTTP).
   *
   * Pela API de cadastro, e nao pelo adaptador interno, porque e ela que monta
   * conta e credencial juntas, do jeito que o login espera. Quem chama ja
   * validou o convite pelo token; a criacao vai MARCADA como autorizada
   * (`criacaoAutorizada`), e e essa marca — nao o e-mail — que o gancho
   * `user.create.before` aceita com o cadastro publico fechado.
   */
  async criarUsuarioComSenha(dados: { nome: string; email: string; senha: string }): Promise<UsuarioDeAutenticacao> {
    const email = dados.email.toLowerCase();
    const resposta = await criacaoAutorizada.run({ porConvite: true }, () =>
      obterAutenticacao().api.signUpEmail({
        body: { name: dados.nome, email, password: dados.senha },
      }),
    );

    const criado = resposta?.user;
    if (!criado) throw new Error("A criação da conta não devolveu usuário.");
    return { id: criado.id, nome: criado.name, email: criado.email };
  }

  async definirSenha(usuarioId: string, senha: string): Promise<void> {
    const ctx = await this.contexto();
    await ctx.internalAdapter.updatePassword(usuarioId, await ctx.password.hash(senha));
    // Trocar a senha derruba o que estava aberto: e o comportamento que a
    // propria biblioteca aplica na redefinicao (`revokeSessionsOnPasswordReset`).
    await ctx.internalAdapter.deleteUserSessions(usuarioId);
  }

  async encerrarSessoes(usuarioId: string): Promise<void> {
    const ctx = await this.contexto();
    await ctx.internalAdapter.deleteUserSessions(usuarioId);
  }
}
