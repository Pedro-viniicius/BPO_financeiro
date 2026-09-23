import { sql } from "drizzle-orm";

import type { DataCivil } from "@/compartilhado/datas/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";
import { GeradorCodigoPostgres, type PrefixoCodigo } from "@/nucleo/codigos/publico";

import type {
  EtapaDaImplantacao,
  LoteDeImportacao,
  RepositorioImplantacao,
  ResultadoDaImportacao,
  SituacaoDaEtapa,
} from "../aplicacao/repositorio-implantacao";
import type { ContaImportada, ErroDaLinha, PessoaImportada } from "../dominio/planilhas";

/** Só dígitos, para comparar documento escrito de jeitos diferentes. */
const soDigitos = (texto: string) => texto.replace(/\D/g, "");

interface Registrador {
  entidade: string;
  entidadeId: string;
}

export class RepositorioImplantacaoDrizzle implements RepositorioImplantacao {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async dataDeCorte(escopo: EscopoEmpresa): Promise<DataCivil | null> {
    const [linha] = await this.banco.execute<{ data: string | null }>(sql`
      SELECT data_inicio_uso::text AS data FROM empresas WHERE id = ${escopo.empresaId}
    `);
    return (linha?.data as DataCivil | null) ?? null;
  }

  async situacao(escopo: EscopoEmpresa): Promise<readonly SituacaoDaEtapa[]> {
    const [linha] = await this.banco.execute<Record<string, string | null>>(sql`
      SELECT
        (SELECT data_inicio_uso::text FROM empresas WHERE id = ${escopo.empresaId}) AS corte,
        (SELECT cnpj FROM empresas WHERE id = ${escopo.empresaId}) AS cnpj,
        (SELECT count(*)::text FROM contas_plano WHERE empresa_id = ${escopo.empresaId}) AS contas_plano,
        (SELECT count(*)::text FROM categorias_financeiras WHERE empresa_id = ${escopo.empresaId}) AS categorias,
        (SELECT count(*)::text FROM contas_bancarias WHERE empresa_id = ${escopo.empresaId}) AS bancos,
        (SELECT count(*)::text FROM pessoas p
          WHERE EXISTS (SELECT 1 FROM clientes c WHERE c.pessoa_id = p.id AND c.empresa_id = ${escopo.empresaId})
             OR EXISTS (SELECT 1 FROM fornecedores f WHERE f.pessoa_id = p.id AND f.empresa_id = ${escopo.empresaId})
        ) AS pessoas,
        (SELECT count(*)::text FROM titulos_pagar WHERE empresa_id = ${escopo.empresaId}) AS pagar,
        (SELECT count(*)::text FROM titulos_receber WHERE empresa_id = ${escopo.empresaId}) AS receber,
        (SELECT count(*)::text FROM dividas WHERE empresa_id = ${escopo.empresaId}) AS dividas
    `);

    const numero = (chave: string) => Number(linha?.[chave] ?? "0");
    const corte = linha?.["corte"];

    const etapas: { etapa: EtapaDaImplantacao; titulo: string; explicacao: string; concluida: boolean; resumo: string; rota: string }[] = [
      {
        etapa: "empresa",
        titulo: "Dados da empresa e data de corte",
        explicacao: "A data de corte separa o que veio de antes do que nasce aqui. Todo o resto depende dela.",
        concluida: Boolean(corte),
        resumo: corte ? `Usa o sistema desde ${String(corte).split("-").reverse().join("/")}` : "Falta a data de corte",
        rota: "/configuracoes/empresa",
      },
      {
        etapa: "plano",
        titulo: "Plano de contas",
        explicacao: "Sem categoria não é possível lançar nem classificar nada.",
        concluida: numero("categorias") > 0,
        resumo: `${numero("contas_plano")} contas e ${numero("categorias")} categorias`,
        rota: "/cadastros/plano-de-contas",
      },
      {
        etapa: "bancos",
        titulo: "Contas bancárias com saldo na data de corte",
        explicacao: "O saldo inicial é o do extrato no dia do corte — é dele que o sistema parte.",
        concluida: numero("bancos") > 0,
        resumo: numero("bancos") === 0 ? "Nenhuma conta cadastrada" : `${numero("bancos")} conta(s)`,
        rota: "/bancos",
      },
      {
        etapa: "pessoas",
        titulo: "Clientes e fornecedores",
        explicacao: "Pela tela, uma a uma, ou por planilha.",
        concluida: numero("pessoas") > 0,
        resumo: numero("pessoas") === 0 ? "Nenhum cadastro" : `${numero("pessoas")} pessoa(s)`,
        rota: "/configuracoes/implantacao/pessoas",
      },
      {
        etapa: "contas",
        titulo: "Contas a pagar e a receber em aberto",
        explicacao: "O que estava em aberto na data de corte. O que vier depois é lançado pela tela.",
        concluida: numero("pagar") + numero("receber") > 0,
        resumo: `${numero("pagar")} a pagar e ${numero("receber")} a receber`,
        rota: "/configuracoes/implantacao/contas",
      },
      {
        etapa: "dividas",
        titulo: "Dívidas em andamento",
        explicacao: "Pelo cadastro de Dívidas, informando as parcelas que ainda faltam.",
        concluida: numero("dividas") > 0,
        resumo: numero("dividas") === 0 ? "Nenhuma dívida" : `${numero("dividas")} dívida(s)`,
        rota: "/dividas/nova",
      },
    ];

    return etapas;
  }

  async conferirContas(escopo: EscopoEmpresa, contas: readonly ContaImportada[]): Promise<readonly ErroDaLinha[]> {
    if (contas.length === 0) return [];

    const categorias = await this.categoriasAtivas(this.banco, escopo);
    const pessoas = await this.pessoasConhecidas(this.banco, escopo);
    const erros: ErroDaLinha[] = [];

    for (const conta of contas) {
      if (!categorias.has(this.chave(conta.categoria))) {
        erros.push({
          linha: conta.linha,
          coluna: "Categoria",
          motivo: "Não existe categoria ativa com esse nome. Crie-a no plano de contas, ou corrija a planilha.",
          valor: conta.categoria,
        });
      }

      const papel = conta.tipo === "pagar" ? "fornecedor" : "cliente";
      const encontrada = this.acharPessoa(pessoas, conta.pessoa);
      if (!encontrada) {
        erros.push({
          linha: conta.linha,
          coluna: "Cliente ou fornecedor",
          motivo: "Não encontrado. Importe as pessoas antes das contas, ou confira o nome/documento.",
          valor: conta.pessoa,
        });
      } else if (papel === "fornecedor" && !encontrada.fornecedorId) {
        erros.push({ linha: conta.linha, coluna: "Cliente ou fornecedor", motivo: "Existe, mas não é fornecedor.", valor: conta.pessoa });
      } else if (papel === "cliente" && !encontrada.clienteId) {
        erros.push({ linha: conta.linha, coluna: "Cliente ou fornecedor", motivo: "Existe, mas não é cliente.", valor: conta.pessoa });
      }
    }

    return erros;
  }

  async importarPessoas(
    escopo: EscopoEmpresa,
    dados: { arquivoNome: string; pessoas: readonly PessoaImportada[] },
    usuarioId: string,
  ): Promise<ResultadoDaImportacao> {
    return executarEmTransacao(async (transacao) => {
      const conhecidas = await this.pessoasConhecidas(transacao, escopo);
      const registros: Registrador[] = [];
      let criados = 0;
      let reaproveitados = 0;

      for (const pessoa of dados.pessoas) {
        const existente = pessoa.documento
          ? conhecidas.get(`doc:${pessoa.documento}`)
          : conhecidas.get(`nome:${this.chave(pessoa.nome)}`);

        let pessoaId: string;
        if (existente) {
          /*
           * Pessoa ja cadastrada NAO e duplicada: ela so ganha o papel que
           * faltava. O documento e a chave, porque nome se escreve de varios
           * jeitos e o CPF/CNPJ, nao.
           */
          pessoaId = existente.pessoaId;
          reaproveitados += 1;
        } else {
          const [criada] = await transacao.execute<{ id: string }>(sql`
            INSERT INTO pessoas (organizacao_id, nome, tipo, cpf_cnpj, email, telefone)
            VALUES (${escopo.organizacaoId}, ${pessoa.nome}, ${pessoa.tipo}::tipo_pessoa,
                    ${pessoa.documento}, ${pessoa.email}, ${pessoa.telefone})
            RETURNING id::text AS id
          `);
          pessoaId = criada!.id;
          registros.push({ entidade: "pessoas", entidadeId: pessoaId });
          criados += 1;
          conhecidas.set(`nome:${this.chave(pessoa.nome)}`, { pessoaId, clienteId: null, fornecedorId: null });
          if (pessoa.documento) conhecidas.set(`doc:${pessoa.documento}`, { pessoaId, clienteId: null, fornecedorId: null });
        }

        if (pessoa.ehCliente) {
          const [papel] = await transacao.execute<{ id: string }>(sql`
            INSERT INTO clientes (empresa_id, pessoa_id) VALUES (${escopo.empresaId}, ${pessoaId}::uuid)
            ON CONFLICT (empresa_id, pessoa_id) DO NOTHING RETURNING id::text AS id
          `);
          if (papel) registros.push({ entidade: "clientes", entidadeId: papel.id });
        }
        if (pessoa.ehFornecedor) {
          const [papel] = await transacao.execute<{ id: string }>(sql`
            INSERT INTO fornecedores (empresa_id, pessoa_id) VALUES (${escopo.empresaId}, ${pessoaId}::uuid)
            ON CONFLICT (empresa_id, pessoa_id) DO NOTHING RETURNING id::text AS id
          `);
          if (papel) registros.push({ entidade: "fornecedores", entidadeId: papel.id });
        }
      }

      const loteId = await this.gravarLote(transacao, escopo, {
        tipo: "pessoas",
        arquivoNome: dados.arquivoNome,
        quantidade: dados.pessoas.length,
        usuarioId,
        registros,
      });

      return { loteId, criados, reaproveitados };
    }, this.banco);
  }

  async importarContas(
    escopo: EscopoEmpresa,
    dados: { arquivoNome: string; contas: readonly ContaImportada[] },
    usuarioId: string,
  ): Promise<ResultadoDaImportacao> {
    return executarEmTransacao(async (transacao) => {
      const categorias = await this.categoriasAtivas(transacao, escopo);
      const pessoas = await this.pessoasConhecidas(transacao, escopo);
      const registros: Registrador[] = [];
      // O MESMO gerador das telas: codigo importado e codigo lancado a mao
      // saem da mesma sequencia, senao dois titulos nasceriam com CP-2026-000007.
      const codigos = new GeradorCodigoPostgres(transacao);

      for (const conta of dados.contas) {
        const categoriaId = categorias.get(this.chave(conta.categoria))!;
        const pessoa = this.acharPessoa(pessoas, conta.pessoa)!;
        const aPagar = conta.tipo === "pagar";

        /*
         * UMA LINHA, UM TITULO DE UMA PARCELA.
         *
         * A carga inicial traz o que esta EM ABERTO, e cada linha e uma
         * parcela em aberto. Agrupar linhas em um titulo parcelado exigiria
         * que a pessoa repetisse os dados do titulo em cada linha e acertasse
         * todas — e um erro em uma linha mudaria o titulo inteiro.
         *
         * O valor gravado e o SALDO (valor menos o que ja foi pago), e o
         * original fica nas observacoes. Registrar o valor cheio exigiria
         * inventar uma baixa, e baixa cria movimentacao bancaria que nunca
         * aconteceu — o extrato deixaria de fechar no primeiro dia.
         */
        const saldo = conta.valor.subtrair(conta.valorPago);
        const parcelado = conta.quantidadeParcelas > 1 ? ` (parcela ${conta.numeroParcela}/${conta.quantidadeParcelas})` : "";
        const observacoes = conta.valorPago.ehZero()
          ? "Importado na carga inicial."
          : `Importado na carga inicial. Valor original ${conta.valor.formatarBrasileiro()}, já pago ${conta.valorPago.formatarBrasileiro()} antes da data de corte.`;

        const tabela = aPagar ? "titulos_pagar" : "titulos_receber";
        const coluna = aPagar ? "fornecedor_id" : "cliente_id";
        const papelId = aPagar ? pessoa.fornecedorId : pessoa.clienteId;
        const prefixo: PrefixoCodigo = aPagar ? "CP" : "CR";
        const ano = Number(conta.dataCompetencia.slice(0, 4));
        const codigo = await codigos.gerarProximo(escopo.empresaId, prefixo, ano);

        const [titulo] = await transacao.execute<{ id: string }>(sql`
          INSERT INTO ${sql.raw(tabela)}
            (empresa_id, codigo, descricao, ${sql.raw(coluna)}, categoria_id, data_competencia,
             valor_total, quantidade_parcelas, situacao, numero_documento, observacoes)
          VALUES (${escopo.empresaId}, ${codigo},
                  ${conta.descricao + parcelado}, ${papelId}::uuid, ${categoriaId}::uuid, ${conta.dataCompetencia}::date,
                  ${saldo.paraTexto()}, 1, 'aberto', ${conta.documento}, ${observacoes})
          RETURNING id::text AS id
        `);
        registros.push({ entidade: tabela, entidadeId: titulo!.id });

        const tabelaParcela = aPagar ? "parcelas_pagar" : "parcelas_receber";
        const colunaTitulo = aPagar ? "titulo_pagar_id" : "titulo_receber_id";
        const [parcela] = await transacao.execute<{ id: string }>(sql`
          INSERT INTO ${sql.raw(tabelaParcela)}
            (${sql.raw(colunaTitulo)}, empresa_id, numero_parcela, data_vencimento, valor_original, situacao)
          VALUES (${titulo!.id}::uuid, ${escopo.empresaId}, 1, ${conta.dataVencimento}::date, ${saldo.paraTexto()}, 'aberta')
          RETURNING id::text AS id
        `);
        registros.push({ entidade: tabelaParcela, entidadeId: parcela!.id });
      }

      const loteId = await this.gravarLote(transacao, escopo, {
        tipo: "contas",
        arquivoNome: dados.arquivoNome,
        quantidade: dados.contas.length,
        usuarioId,
        registros,
      });

      return { loteId, criados: dados.contas.length, reaproveitados: 0 };
    }, this.banco);
  }

  async listarLotes(escopo: EscopoEmpresa): Promise<readonly LoteDeImportacao[]> {
    const linhas = await this.banco.execute<{
      id: string; tipo: string; arquivo_nome: string; quantidade: number;
      criado_em: string; criado_por_nome: string; desfeito_em: string | null; motivo: string | null; usados: string;
    }>(sql`
      SELECT l.id::text AS id, l.tipo::text AS tipo, l.arquivo_nome, l.quantidade,
             l.criado_em::text AS criado_em, COALESCE(u.name, '—') AS criado_por_nome,
             l.desfeito_em::text AS desfeito_em, l.motivo_desfazer AS motivo,
             (
               -- Quantos itens do lote ja foram USADOS: parcela que saiu de
               -- "aberta" (baixa, cancelamento) ou titulo editado depois.
               SELECT count(*) FROM itens_lote_importacao i
               WHERE i.lote_id = l.id AND (
                 (i.entidade = 'parcelas_pagar' AND EXISTS (
                    SELECT 1 FROM parcelas_pagar p WHERE p.id = i.entidade_id
                      AND (p.situacao <> 'aberta' OR p.atualizado_em > l.criado_em + interval '5 seconds')))
                 OR (i.entidade = 'parcelas_receber' AND EXISTS (
                    SELECT 1 FROM parcelas_receber p WHERE p.id = i.entidade_id
                      AND (p.situacao <> 'aberta' OR p.atualizado_em > l.criado_em + interval '5 seconds')))
                 OR (i.entidade = 'titulos_pagar' AND EXISTS (
                    SELECT 1 FROM titulos_pagar t WHERE t.id = i.entidade_id
                      AND t.atualizado_em > l.criado_em + interval '5 seconds'))
                 OR (i.entidade = 'titulos_receber' AND EXISTS (
                    SELECT 1 FROM titulos_receber t WHERE t.id = i.entidade_id
                      AND t.atualizado_em > l.criado_em + interval '5 seconds'))
               )
             )::text AS usados
      FROM lotes_importacao l
      LEFT JOIN "user" u ON u.id = l.criado_por
      WHERE l.empresa_id = ${escopo.empresaId}
      ORDER BY l.criado_em DESC
    `);

    return linhas.map((linha) => {
      const usados = Number(linha.usados);
      const desfeito = linha.desfeito_em !== null;
      return {
        id: linha.id,
        tipo: linha.tipo as "pessoas" | "contas",
        arquivoNome: linha.arquivo_nome,
        quantidade: linha.quantidade,
        criadoEm: new Date(linha.criado_em),
        criadoPorNome: linha.criado_por_nome,
        desfeitoEm: desfeito ? new Date(linha.desfeito_em!) : null,
        motivoDesfazer: linha.motivo,
        podeDesfazer: !desfeito && usados === 0,
        motivoNaoPodeDesfazer: desfeito
          ? "Já foi desfeito."
          : usados > 0
            ? `${usados} ${usados === 1 ? "conta deste lote já foi usada" : "contas deste lote já foram usadas"} (baixa, cancelamento ou edição). Desfazer apagaria esse trabalho.`
            : null,
      };
    });
  }

  async desfazerLote(escopo: EscopoEmpresa, loteId: string, motivo: string, usuarioId: string): Promise<{ removidos: number }> {
    return executarEmTransacao(async (transacao) => {
      const lotes = await this.listarLotes(escopo);
      const lote = lotes.find((l) => l.id === loteId);
      if (!lote) throw new Error("Lote não encontrado.");
      if (!lote.podeDesfazer) throw new Error(lote.motivoNaoPodeDesfazer ?? "Este lote não pode ser desfeito.");

      /*
       * Ao CONTRARIO da ordem de criacao: o titulo sai antes da pessoa, senao
       * a chave estrangeira recusa. E `RESTRICT` em toda parte garante que,
       * se algo tiver passado despercebido pela checagem, o banco recusa a
       * exclusao em vez de apagar em cascata.
       */
      const itens = await transacao.execute<{ entidade: string; entidade_id: string }>(sql`
        SELECT entidade, entidade_id::text AS entidade_id FROM itens_lote_importacao
        WHERE lote_id = ${loteId}::uuid ORDER BY ordem DESC
      `);

      for (const item of itens) {
        await transacao.execute(sql`DELETE FROM ${sql.raw(item.entidade)} WHERE id = ${item.entidade_id}::uuid`);
      }

      await transacao.execute(sql`
        UPDATE lotes_importacao SET desfeito_em = now(), desfeito_por = ${usuarioId}, motivo_desfazer = ${motivo}
        WHERE id = ${loteId}::uuid AND empresa_id = ${escopo.empresaId}
      `);

      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "importacao.desfeita",
        entidade: "lote_importacao",
        entidadeId: loteId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosDepois: { motivo, itensRemovidos: itens.length },
      });

      return { removidos: itens.length };
    }, this.banco);
  }

  // ------------------------------------------------------------------ apoio

  private chave(texto: string): string {
    return texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  private async categoriasAtivas(executor: ExecutorBancoDados, escopo: EscopoEmpresa): Promise<Map<string, string>> {
    const linhas = await executor.execute<{ id: string; nome: string }>(sql`
      SELECT id::text AS id, nome FROM categorias_financeiras
      WHERE empresa_id = ${escopo.empresaId} AND ativa = true
    `);
    return new Map(linhas.map((linha) => [this.chave(linha.nome), linha.id]));
  }

  private async pessoasConhecidas(executor: ExecutorBancoDados, escopo: EscopoEmpresa) {
    const linhas = await executor.execute<{
      pessoa_id: string; nome: string; documento: string | null; cliente_id: string | null; fornecedor_id: string | null;
    }>(sql`
      SELECT p.id::text AS pessoa_id, p.nome, p.cpf_cnpj AS documento,
             (SELECT c.id::text FROM clientes c WHERE c.pessoa_id = p.id AND c.empresa_id = ${escopo.empresaId}) AS cliente_id,
             (SELECT f.id::text FROM fornecedores f WHERE f.pessoa_id = p.id AND f.empresa_id = ${escopo.empresaId}) AS fornecedor_id
      FROM pessoas p
      WHERE p.organizacao_id = ${escopo.organizacaoId}
    `);

    const mapa = new Map<string, { pessoaId: string; clienteId: string | null; fornecedorId: string | null }>();
    for (const linha of linhas) {
      const valor = { pessoaId: linha.pessoa_id, clienteId: linha.cliente_id, fornecedorId: linha.fornecedor_id };
      mapa.set(`nome:${this.chave(linha.nome)}`, valor);
      if (linha.documento) mapa.set(`doc:${soDigitos(linha.documento)}`, valor);
    }
    return mapa;
  }

  /** Procura por DOCUMENTO primeiro: nome se escreve de varios jeitos. */
  private acharPessoa(
    pessoas: Map<string, { pessoaId: string; clienteId: string | null; fornecedorId: string | null }>,
    referencia: string,
  ) {
    const digitos = soDigitos(referencia);
    if (digitos.length >= 11) {
      const porDocumento = pessoas.get(`doc:${digitos}`);
      if (porDocumento) return porDocumento;
    }
    return pessoas.get(`nome:${this.chave(referencia)}`) ?? null;
  }

  private async gravarLote(
    transacao: ExecutorBancoDados,
    escopo: EscopoEmpresa,
    dados: { tipo: "pessoas" | "contas"; arquivoNome: string; quantidade: number; usuarioId: string; registros: Registrador[] },
  ): Promise<string> {
    const [lote] = await transacao.execute<{ id: string }>(sql`
      INSERT INTO lotes_importacao (empresa_id, tipo, arquivo_nome, quantidade, criado_por)
      VALUES (${escopo.empresaId}, ${dados.tipo}::tipo_lote_importacao, ${dados.arquivoNome}, ${dados.quantidade}, ${dados.usuarioId})
      RETURNING id::text AS id
    `);

    let ordem = 0;
    for (const registro of dados.registros) {
      ordem += 1;
      await transacao.execute(sql`
        INSERT INTO itens_lote_importacao (lote_id, entidade, entidade_id, ordem)
        VALUES (${lote!.id}::uuid, ${registro.entidade}, ${registro.entidadeId}::uuid, ${ordem})
      `);
    }

    await new RegistradorAuditoriaDrizzle(transacao).registrar({
      acao: "importacao.executada",
      entidade: "lote_importacao",
      entidadeId: lote!.id,
      organizacaoId: escopo.organizacaoId,
      empresaId: escopo.empresaId,
      usuarioId: comoIdentificador<"Usuario">(dados.usuarioId),
      origem: "importacao",
      dadosDepois: { tipo: dados.tipo, arquivo: dados.arquivoNome, linhas: dados.quantidade, registros: dados.registros.length },
    });

    return lote!.id;
  }
}
