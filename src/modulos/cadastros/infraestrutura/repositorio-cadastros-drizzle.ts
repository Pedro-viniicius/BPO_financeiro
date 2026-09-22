import { and, asc, eq, ilike, or } from "drizzle-orm";

import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
/*
 * Tabelas de OUTRO modulo vem do agregador de esquemas: um modulo so conhece o
 * outro pelo `publico.ts`, e esquema nao e interface publica.
 */
import { categoriasFinanceiras, contasPlano } from "@/banco-dados/esquemas/indice";
import { executarEmTransacao, type BancoDados } from "@/nucleo/banco-dados/publico";

import type {
  CategoriaNaLista,
  DadosNovaCategoria,
  DadosNovaPessoa,
  OpcaoSimples,
  PessoaNaLista,
  RepositorioCadastros,
} from "../aplicacao/repositorio-cadastros";
import { PLANO_PADRAO } from "../aplicacao/plano-padrao";
import { clientes, fornecedores, pessoas } from "./esquema";

/**
 * Cadastros no PostgreSQL.
 *
 * ISOLAMENTO: os PAPEIS (cliente, fornecedor) filtram por `empresaId`. As
 * PESSOAS filtram por `organizacaoId`, porque a identidade e compartilhada
 * dentro do grupo — e o proprio modelo do Gate 3 (ADR-005). Nos dois casos o
 * escopo vem do contexto do servidor, nunca do cliente.
 */
export class RepositorioCadastrosDrizzle implements RepositorioCadastros {
  constructor(private readonly banco: BancoDados) {}

  async listarPessoas(escopo: EscopoEmpresa, busca?: string): Promise<readonly PessoaNaLista[]> {
    const condicoes = [eq(pessoas.organizacaoId, escopo.organizacaoId), eq(pessoas.ativo, true)];
    if (busca) {
      const alvo = `%${busca}%`;
      const filtro = or(ilike(pessoas.nome, alvo), ilike(pessoas.cpfCnpj, alvo));
      if (filtro) condicoes.push(filtro);
    }

    const linhas = await this.banco
      .select({
        pessoaId: pessoas.id,
        nome: pessoas.nome,
        tipo: pessoas.tipo,
        cpfCnpj: pessoas.cpfCnpj,
        email: pessoas.email,
        telefone: pessoas.telefone,
        clienteId: clientes.id,
        fornecedorId: fornecedores.id,
      })
      .from(pessoas)
      .leftJoin(clientes, and(eq(clientes.pessoaId, pessoas.id), eq(clientes.empresaId, escopo.empresaId)))
      .leftJoin(fornecedores, and(eq(fornecedores.pessoaId, pessoas.id), eq(fornecedores.empresaId, escopo.empresaId)))
      .where(and(...condicoes))
      .orderBy(asc(pessoas.nome));

    return linhas.map((l) => ({
      pessoaId: l.pessoaId,
      nome: l.nome,
      tipo: l.tipo,
      cpfCnpj: l.cpfCnpj,
      email: l.email,
      telefone: l.telefone,
      ehCliente: l.clienteId !== null,
      ehFornecedor: l.fornecedorId !== null,
      clienteId: l.clienteId,
      fornecedorId: l.fornecedorId,
    }));
  }

  /** Pessoa e papeis nascem juntos: uma pessoa sem papel nenhum nao serve a nada. */
  async criarPessoa(escopo: EscopoEmpresa, dados: DadosNovaPessoa): Promise<{ pessoaId: string }> {
    return executarEmTransacao(async (transacao) => {
      const [pessoa] = await transacao
        .insert(pessoas)
        .values({
          organizacaoId: escopo.organizacaoId,
          tipo: dados.tipo,
          nome: dados.nome,
          cpfCnpj: dados.cpfCnpj ?? null,
          email: dados.email ?? null,
          telefone: dados.telefone ?? null,
        })
        .returning({ id: pessoas.id });

      if (dados.ehCliente) {
        await transacao.insert(clientes).values({ empresaId: escopo.empresaId, pessoaId: pessoa!.id });
      }
      if (dados.ehFornecedor) {
        await transacao.insert(fornecedores).values({ empresaId: escopo.empresaId, pessoaId: pessoa!.id });
      }
      return { pessoaId: pessoa!.id };
    }, this.banco);
  }

  async listarFornecedores(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]> {
    return this.banco
      .select({ id: fornecedores.id, nome: pessoas.nome })
      .from(fornecedores)
      .innerJoin(pessoas, eq(pessoas.id, fornecedores.pessoaId))
      .where(and(eq(fornecedores.empresaId, escopo.empresaId), eq(fornecedores.ativo, true)))
      .orderBy(asc(pessoas.nome));
  }

  async listarClientes(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]> {
    return this.banco
      .select({ id: clientes.id, nome: pessoas.nome })
      .from(clientes)
      .innerJoin(pessoas, eq(pessoas.id, clientes.pessoaId))
      .where(and(eq(clientes.empresaId, escopo.empresaId), eq(clientes.ativo, true)))
      .orderBy(asc(pessoas.nome));
  }

  async listarCategorias(escopo: EscopoEmpresa): Promise<readonly CategoriaNaLista[]> {
    return this.banco
      .select({
        id: categoriasFinanceiras.id,
        nome: categoriasFinanceiras.nome,
        contaPlanoNome: contasPlano.nome,
        grupoDre: contasPlano.grupoDre,
      })
      .from(categoriasFinanceiras)
      .innerJoin(contasPlano, eq(contasPlano.id, categoriasFinanceiras.contaPlanoId))
      .where(and(eq(categoriasFinanceiras.empresaId, escopo.empresaId), eq(categoriasFinanceiras.ativa, true)))
      .orderBy(asc(categoriasFinanceiras.nome));
  }

  async criarCategoria(escopo: EscopoEmpresa, dados: DadosNovaCategoria): Promise<{ categoriaId: string }> {
    const [categoria] = await this.banco
      .insert(categoriasFinanceiras)
      .values({ empresaId: escopo.empresaId, nome: dados.nome, contaPlanoId: dados.contaPlanoId })
      .returning({ id: categoriasFinanceiras.id });
    return { categoriaId: categoria!.id };
  }

  /**
   * Semeia plano e categorias em UMA transacao. Se ja houver qualquer conta do
   * plano, nao faz nada: a semente e ponto de partida, nunca sobrescreve o que
   * o cliente ja organizou.
   */
  async semearPlanoPadrao(escopo: EscopoEmpresa): Promise<{ contasCriadas: number; categoriasCriadas: number }> {
    return executarEmTransacao(async (transacao) => {
      const [existente] = await transacao
        .select({ id: contasPlano.id })
        .from(contasPlano)
        .where(eq(contasPlano.empresaId, escopo.empresaId))
        .limit(1);
      if (existente) return { contasCriadas: 0, categoriasCriadas: 0 };

      let categoriasCriadas = 0;
      for (const conta of PLANO_PADRAO) {
        const [criada] = await transacao
          .insert(contasPlano)
          .values({ empresaId: escopo.empresaId, codigo: conta.codigo, nome: conta.nome, grupoDre: conta.grupoDre })
          .returning({ id: contasPlano.id });

        for (const nome of conta.categorias) {
          await transacao
            .insert(categoriasFinanceiras)
            .values({ empresaId: escopo.empresaId, nome, contaPlanoId: criada!.id });
          categoriasCriadas += 1;
        }
      }
      return { contasCriadas: PLANO_PADRAO.length, categoriasCriadas };
    }, this.banco);
  }

  async listarContasPlano(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]> {
    return this.banco
      .select({ id: contasPlano.id, nome: contasPlano.nome })
      .from(contasPlano)
      .where(and(eq(contasPlano.empresaId, escopo.empresaId), eq(contasPlano.ativa, true)))
      .orderBy(asc(contasPlano.codigo));
  }
}
