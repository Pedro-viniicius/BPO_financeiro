import { z } from "zod";

import { ErroValidacao } from "@/compartilhado/erros/erros-comuns";
import { falha, type Resultado, sucesso } from "@/compartilhado/erros/resultado";
import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";
import { esquemaCnpj, esquemaTextoCurto } from "@/compartilhado/validacao/esquemas-comuns";
import { ACOES_AUDITORIA, type OrigemAcao } from "@/nucleo/auditoria/publico";

import { CnpjJaCadastrado, UsuarioJaPossuiEmpresa } from "../dominio/acesso-empresas";
import type { UnidadeInstalacaoEmpresa } from "./repositorio-acesso-empresas";

/** Papel que o criador da primeira empresa recebe. Fixo por definicao do instalador. */
export const PAPEL_DO_INSTALADOR = "administrador" as const;

/** O que o formulario de primeiro acesso envia. Nada financeiro entra aqui. */
export const esquemaInstalacaoEmpresa = z.object({
  nome: esquemaTextoCurto,
  nomeFantasia: z.string().trim().max(200, "Maximo de 200 caracteres.").optional(),
  /** Aceita com ou sem mascara; guardamos so os digitos. */
  cnpj: z
    .string()
    .trim()
    .transform((texto) => texto.replace(/\D/g, ""))
    .pipe(z.union([z.literal(""), esquemaCnpj]))
    .optional(),
});

export type DadosInstalacaoEmpresa = z.input<typeof esquemaInstalacaoEmpresa>;

export interface QuemInstala {
  readonly usuarioId: IdUsuario;
  readonly origem: OrigemAcao;
  readonly requisicaoId?: string;
  readonly ip?: string;
  readonly agenteUsuario?: string;
}

export interface EmpresaInstalada {
  readonly organizacaoId: IdOrganizacao;
  readonly empresaId: IdEmpresa;
}

/**
 * Instalador da primeira empresa.
 *
 * Cria organizacao + empresa + vinculo de administrador para o usuario, tudo
 * ou nada. Quem chama ja verificou que ha sessao; aqui verificamos, dentro da
 * transacao e sob lock, que o usuario ainda nao tem empresa — a tela nao e a
 * protecao, o caso de uso e.
 */
export async function instalarPrimeiraEmpresa(
  unidade: UnidadeInstalacaoEmpresa,
  quem: QuemInstala,
  entrada: DadosInstalacaoEmpresa,
): Promise<Resultado<EmpresaInstalada, ErroValidacao | UsuarioJaPossuiEmpresa | CnpjJaCadastrado>> {
  const validacao = esquemaInstalacaoEmpresa.safeParse(entrada);
  if (!validacao.success) {
    const campos: Record<string, string[]> = {};
    for (const problema of validacao.error.issues) {
      const campo = problema.path.join(".") || "formulario";
      (campos[campo] ??= []).push(problema.message);
    }
    return falha(new ErroValidacao("Confira os campos destacados.", campos));
  }
  const dados = validacao.data;
  const cnpj = dados.cnpj ? dados.cnpj : undefined;
  const nomeFantasia = dados.nomeFantasia ? dados.nomeFantasia : undefined;

  return unidade.executarAtomicamente(async (escrita) => {
    await escrita.travarUsuarioParaInstalacao(quem.usuarioId);

    if ((await escrita.contarVinculosAtivos(quem.usuarioId)) > 0) {
      return falha(new UsuarioJaPossuiEmpresa(quem.usuarioId));
    }
    if (cnpj && (await escrita.cnpjJaExiste(cnpj))) {
      return falha(new CnpjJaCadastrado());
    }

    // A organizacao nasce com o nome da empresa; um grupo com varias empresas
    // renomeia depois (Configuracoes). Evita perguntar algo que 90% nao tem.
    const organizacaoId = await escrita.criarOrganizacao({ nome: dados.nome });
    const empresaId = await escrita.criarEmpresa({
      organizacaoId,
      nome: dados.nome,
      ...(nomeFantasia ? { nomeFantasia } : {}),
      ...(cnpj ? { cnpj } : {}),
    });
    await escrita.criarVinculo({ usuarioId: quem.usuarioId, organizacaoId, empresaId, papel: PAPEL_DO_INSTALADOR });
    await escrita.registrarAuditoria({
      acao: ACOES_AUDITORIA.empresaInstalada,
      entidade: "empresa",
      entidadeId: empresaId,
      organizacaoId,
      empresaId,
      usuarioId: quem.usuarioId,
      origem: quem.origem,
      dadosDepois: { nome: dados.nome, ...(cnpj ? { cnpj } : {}), papelDoInstalador: PAPEL_DO_INSTALADOR },
      ...(quem.requisicaoId ? { requisicaoId: quem.requisicaoId } : {}),
      ...(quem.ip ? { ip: quem.ip } : {}),
      ...(quem.agenteUsuario ? { agenteUsuario: quem.agenteUsuario } : {}),
    });

    return sucesso({ organizacaoId, empresaId });
  });
}
