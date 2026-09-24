import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, CabecalhoPagina, SeloSituacao, TituloSecao } from "@/interface/componentes/indice";
import { CredenciaisBetterAuth } from "@/nucleo/autenticacao/publico";
import { NOMES_PAPEIS } from "@/nucleo/autorizacao/publico";
import { obterBancoDados } from "@/nucleo/banco-dados/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { PRAZO_DO_CONVITE_HORAS, RepositorioGestaoDeUsuariosDrizzle } from "@/nucleo/empresas/publico";

import { exigirContextoFinanceiro } from "../../_apoio/contexto-financeiro";
import { AcoesDoUsuario, ConviteNovo, LinhaDeConvite } from "./formularios";
import estilos from "./usuarios.module.css";

export const metadata: Metadata = { title: "Usuários e acessos" };

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/**
 * Quem tem acesso, com que papel, e desde quando nao entra.
 *
 * USUARIO NUNCA E EXCLUIDO: o historico e a auditoria apontam para ele — quem
 * deu a baixa, quem cancelou o titulo. Apagar a pessoa transformaria anos de
 * registro em "usuario desconhecido". O caminho e desativar.
 */
export default async function PaginaUsuarios() {
  const { escopo, usuarioId } = await exigirContextoFinanceiro("usuarios.gerenciar", "/configuracoes/usuarios");

  const repositorio = new RepositorioGestaoDeUsuariosDrizzle(obterBancoDados(), new CredenciaisBetterAuth());
  const { usuarios, convites } = await repositorio.listar(escopo, usuarioId);
  const semSmtp = !obterVariaveisAmbiente().SMTP_URL;

  const administradoresAtivos = usuarios.filter((u) => u.ativo && u.papel === "administrador").length;

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e acessos"
        descricao="Quem entra no sistema desta empresa e o que cada um pode fazer"
        acoesSecundarias={
          <>
            <Link className="acao-secundaria" href="/configuracoes/papeis">Ver o que cada papel faz</Link>{" "}
            <Link className="acao-secundaria" href="/configuracoes">Voltar</Link>
          </>
        }
      />

      {semSmtp ? (
        <Aviso tom="informacao" titulo="O envio de e-mail ainda não está configurado">
          Por isso o convite de uma pessoa <strong>nova</strong> aparece como um <strong>link para copiar</strong>, e você o
          repassa pelo canal que preferir. Já “Redefinir acesso” de quem <strong>já tem conta</strong> só funciona com
          e-mail configurado: esse link abre a conta da pessoa e vai apenas para ela. Enquanto isso, quem perdeu a senha
          usa “Esqueci minha senha” na tela de entrada. O sistema nunca mostra nem envia senhas — quem entra define a
          própria.
        </Aviso>
      ) : null}

      {administradoresAtivos === 1 ? (
        <Aviso tom="atencao" titulo="Só existe um administrador ativo">
          Se essa pessoa perder o acesso, ninguém mais poderá conceder permissões — e a saída passaria a ser mexer no
          banco de dados. Promova ao menos mais uma pessoa a administrador.
        </Aviso>
      ) : null}

      <ConviteNovo />

      <TituloSecao titulo="Pessoas com acesso" />
      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th scope="col">Pessoa</th>
            <th scope="col">Papel</th>
            <th scope="col">Situação</th>
            <th scope="col">Último acesso</th>
            <th scope="col"><span className="apenas-leitor-de-tela">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => (
            <tr key={usuario.usuarioId} className={usuario.ativo ? undefined : estilos.desativado}>
              <td data-rotulo="Pessoa">
                <strong>{usuario.nome}</strong>
                {usuario.ehVoce ? <span className={estilos.voce}> (você)</span> : null}
                <br />
                <span className={estilos.email}>{usuario.email}</span>
              </td>
              <td data-rotulo="Papel">{NOMES_PAPEIS[usuario.papel]}</td>
              <td data-rotulo="Situação">
                <SeloSituacao
                  rotulo={usuario.ativo ? "Ativo" : "Desativado"}
                  tom={usuario.ativo ? "sucesso" : "neutro"}
                />
              </td>
              <td data-rotulo="Último acesso">
                {usuario.ultimoAcesso ? FORMATO_DATA.format(usuario.ultimoAcesso) : "nunca entrou"}
              </td>
              <td data-rotulo="Ações">
                {usuario.vinculoDeOrganizacao ? (
                  /*
                   * Acesso a TODA a organizacao: nao pertence a esta empresa, e
                   * por isso esta tela nao o altera. Gerencia-se no nivel da
                   * organizacao (tela propria, quando existir).
                   */
                  <span className={estilos.email}>Acesso a toda a organização — não é alterado por esta tela.</span>
                ) : (
                  <AcoesDoUsuario
                    usuario={{
                      usuarioId: usuario.usuarioId,
                      nome: usuario.nome,
                      papel: usuario.papel,
                      ativo: usuario.ativo,
                      ehVoce: usuario.ehVoce,
                    }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <TituloSecao
        titulo="Convites em aberto"
        explicacao={`Cada convite vale ${PRAZO_DO_CONVITE_HORAS} horas e serve uma única vez.`}
      />
      {convites.length === 0 ? (
        <p className={estilos.vazio}>Nenhum convite em aberto.</p>
      ) : (
        <ul className={estilos.convites}>
          {convites.map((convite) => (
            <li key={convite.id}>
              <div>
                <strong>{convite.email}</strong> · {NOMES_PAPEIS[convite.papel]}
                <br />
                <span className={estilos.email}>
                  {convite.expirado
                    ? `Expirou em ${FORMATO_DATA.format(convite.expiraEm)} — gere outro.`
                    : `Vale até ${FORMATO_DATA.format(convite.expiraEm)}`}
                  {" · convidado por "}
                  {convite.convidadoPorNome}
                </span>
              </div>
              <LinhaDeConvite conviteId={convite.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
