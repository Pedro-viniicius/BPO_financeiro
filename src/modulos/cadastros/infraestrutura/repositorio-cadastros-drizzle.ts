import { and, asc, eq, ilike, or } from "drizzle-orm";

import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
/*
 * Tabelas de OUTRO modulo vem do agregador de esquemas: um modulo so conhece o
 * outro pelo `publico.ts`, e esquema nao e interface publica.
 */
import { categoriasFinanceiras, contasPlano } from "@/banco-dados/esquemas/indice";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

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
  constructor(private readonly banco: ExecutorBancoDados) {}

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
  /**
   * Acrescenta o que FALTA do plano padrao, sem tocar no que ja existe.
   *
   * Antes, a semente desistia inteira se houvesse qualquer conta. Isso
   * trancava justamente quem mais precisa dela: quem criou duas contas a mao,
   * percebeu que o trabalho seria longo e quis partir do plano pronto. E
   * deixava o resultado depender de QUANDO se aperta o botao.
   *
   * Agora a regra e por item: conta ja existente (mesmo codigo) e mantida como
   * esta — inclusive o nome e o grupo que o cliente tiver ajustado —, e
   * categoria ja existente (mesmo nome) nao e recriada. Apertar duas vezes
   * seguidas cria zero na segunda.
   *
   * O nome da categoria e unico por empresa no banco, entao conferir por nome
   * e conferir pela mesma chave que o banco usa.
   */
  async semearPlanoPadrao(escopo: EscopoEmpresa): Promise<{ contasCriadas: number; categoriasCriadas: number }> {
    return executarEmTransacao(async (transacao) => {
      const contasExistentes = await transacao
        .select({ id: contasPlano.id, codigo: contasPlano.codigo })
        .from(contasPlano)
        .where(eq(contasPlano.empresaId, escopo.empresaId));
      const idPorCodigo = new Map(contasExistentes.map((conta) => [conta.codigo, conta.id]));

      const categoriasExistentes = await transacao
        .select({ nome: categoriasFinanceiras.nome })
        .from(categoriasFinanceiras)
        .where(eq(categoriasFinanceiras.empresaId, escopo.empresaId));
      const nomesUsados = new Set(categoriasExistentes.map((categoria) => categoria.nome));

      let contasCriadas = 0;
      let categoriasCriadas = 0;

      for (const conta of PLANO_PADRAO) {
        let contaId = idPorCodigo.get(conta.codigo);
        if (!contaId) {
          const [criada] = await transacao
            .insert(contasPlano)
            .values({ empresaId: escopo.empresaId, codigo: conta.codigo, nome: conta.nome, grupoDre: conta.grupoDre })
            .returning({ id: contasPlano.id });
          contaId = criada!.id;
          contasCriadas += 1;
        }

        for (const nome of conta.categorias) {
          if (nomesUsados.has(nome)) continue;
          await transacao
            .insert(categoriasFinanceiras)
            .values({ empresaId: escopo.empresaId, nome, contaPlanoId: contaId });
          nomesUsados.add(nome);
          categoriasCriadas += 1;
        }
      }

      return { contasCriadas, categoriasCriadas };
    }, this.banco);
  }

  /**
   * O que a semente acrescentaria, sem gravar nada.
   *
   * E o que a tela mostra antes de o usuario confirmar: "vai criar 5 contas e
   * 11 categorias, estas aqui". Botao que altera o plano de contas sem dizer o
   * que vai fazer e o tipo de coisa que ninguem aperta duas vezes.
   */
  async previaDoPlanoPadrao(escopo: EscopoEmpresa): Promise<{
    contas: readonly { codigo: string; nome: string; grupoDre: string }[];
    categorias: readonly string[];
  }> {
    const contasExistentes = await this.banco
      .select({ codigo: contasPlano.codigo })
      .from(contasPlano)
      .where(eq(contasPlano.empresaId, escopo.empresaId));
    const codigosUsados = new Set(contasExistentes.map((conta) => conta.codigo));

    const categoriasExistentes = await this.banco
      .select({ nome: categoriasFinanceiras.nome })
      .from(categoriasFinanceiras)
      .where(eq(categoriasFinanceiras.empresaId, escopo.empresaId));
    const nomesUsados = new Set(categoriasExistentes.map((categoria) => categoria.nome));

    return {
      contas: PLANO_PADRAO.filter((conta) => !codigosUsados.has(conta.codigo)).map((conta) => ({
        codigo: conta.codigo,
        nome: conta.nome,
        grupoDre: conta.grupoDre,
      })),
      categorias: PLANO_PADRAO.flatMap((conta) => conta.categorias).filter((nome) => !nomesUsados.has(nome)),
    };
  }

  async listarContasPlano(escopo: EscopoEmpresa): Promise<readonly OpcaoSimples[]> {
    return this.banco
      .select({ id: contasPlano.id, nome: contasPlano.nome })
      .from(contasPlano)
      .where(and(eq(contasPlano.empresaId, escopo.empresaId), eq(contasPlano.ativa, true)))
      .orderBy(asc(contasPlano.codigo));
  }
}
