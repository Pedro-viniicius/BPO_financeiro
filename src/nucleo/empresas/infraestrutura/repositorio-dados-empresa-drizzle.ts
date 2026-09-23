import { and, eq, isNull } from "drizzle-orm";

import type { DataCivil } from "@/compartilhado/datas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type { DadosDaEmpresa, RepositorioDadosDaEmpresa } from "../aplicacao/dados-da-empresa";
import { empresas } from "./esquema";

/** Texto vazio vira NULO: "" e ausencia, nao valor. */
function ouNulo(valor: string | null | undefined): string | null {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
}

export class RepositorioDadosDaEmpresaDrizzle implements RepositorioDadosDaEmpresa {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async obter(escopo: EscopoEmpresa): Promise<DadosDaEmpresa | null> {
    const [linha] = await this.banco
      .select({
        razaoSocial: empresas.nome,
        nomeFantasia: empresas.nomeFantasia,
        cnpj: empresas.cnpj,
        email: empresas.email,
        telefone: empresas.telefone,
        cep: empresas.cep,
        logradouro: empresas.logradouro,
        numero: empresas.numero,
        complemento: empresas.complemento,
        bairro: empresas.bairro,
        municipio: empresas.municipio,
        uf: empresas.uf,
        dataInicioUso: empresas.dataInicioUso,
        fusoHorario: empresas.fusoHorario,
      })
      .from(empresas)
      .where(and(eq(empresas.id, escopo.empresaId), isNull(empresas.excluidoEm)))
      .limit(1);

    if (!linha) return null;
    return { ...linha, dataInicioUso: (linha.dataInicioUso as DataCivil | null) ?? null };
  }

  async salvar(escopo: EscopoEmpresa, dados: DadosDaEmpresa, usuarioId: string): Promise<void> {
    await executarEmTransacao(async (transacao) => {
      const antes = await new RepositorioDadosDaEmpresaDrizzle(transacao).obter(escopo);

      await transacao
        .update(empresas)
        .set({
          nome: dados.razaoSocial.trim(),
          nomeFantasia: ouNulo(dados.nomeFantasia),
          cnpj: ouNulo(dados.cnpj),
          email: ouNulo(dados.email),
          telefone: ouNulo(dados.telefone),
          cep: ouNulo(dados.cep),
          logradouro: ouNulo(dados.logradouro),
          numero: ouNulo(dados.numero),
          complemento: ouNulo(dados.complemento),
          bairro: ouNulo(dados.bairro),
          municipio: ouNulo(dados.municipio),
          uf: ouNulo(dados.uf)?.toUpperCase() ?? null,
          dataInicioUso: dados.dataInicioUso,
          atualizadoEm: new Date(),
        })
        .where(eq(empresas.id, escopo.empresaId));

      /*
       * Antes E depois na auditoria. Mudar a data de corte ou o CNPJ da
       * empresa altera como o sistema inteiro le os dados; quando alguem
       * perguntar "por que a carga inicial pegou outro periodo?", a resposta
       * precisa estar registrada com nome e data.
       */
      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "empresa.dados_atualizados",
        entidade: "empresa",
        entidadeId: escopo.empresaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        ...(antes ? { dadosAntes: { ...antes } } : {}),
        dadosDepois: { ...dados },
      });
    }, this.banco);
  }
}
