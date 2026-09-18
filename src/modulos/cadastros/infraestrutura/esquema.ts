import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { tipoPessoa } from "@/banco-dados/esquemas/enumeracoes";
import { arquivos } from "@/nucleo/arquivos/infraestrutura/esquema";
import { empresas, organizacoes } from "@/nucleo/empresas/infraestrutura/esquema";

/**
 * Categoria: PESSOAS E PARCEIROS DE NEGOCIO
 * Documentacao: docs/modelo-dados/categorias/pessoas.md
 *
 * `pessoas` guarda a identidade (quem e) uma unica vez, por organizacao.
 * `clientes` e `fornecedores` sao PAPEIS que uma pessoa exerce perante uma
 * empresa. A mesma pessoa pode ser cliente da empresa A e fornecedora da B,
 * ou ambos na mesma empresa, sem duplicar CPF/CNPJ.
 */
export const pessoas = pgTable(
  "pessoas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacaoId: uuid("organizacao_id")
      .notNull()
      .references(() => organizacoes.id, { onDelete: "restrict" }),
    tipo: tipoPessoa("tipo").notNull(),
    /** Nome completo (pessoa fisica) ou razao social (juridica). */
    nome: text("nome").notNull(),
    nomeFantasia: text("nome_fantasia"),
    /** Somente digitos: 11 (CPF) ou 14 (CNPJ). Opcional: nem todo fornecedor informal tem documento cadastrado. */
    cpfCnpj: text("cpf_cnpj"),
    email: text("email"),
    telefone: text("telefone"),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    index("pessoas_organizacao_nome_idx").on(tabela.organizacaoId, tabela.nome),
    uniqueIndex("unico_pessoas_documento").on(tabela.organizacaoId, tabela.cpfCnpj).where(sql`cpf_cnpj IS NOT NULL`),
    check(
      "verifica_pessoas_documento",
      sql`cpf_cnpj IS NULL OR (tipo = 'fisica' AND cpf_cnpj ~ '^[0-9]{11}$') OR (tipo = 'juridica' AND cpf_cnpj ~ '^[0-9]{14}$')`,
    ),
    check("verifica_pessoas_nome", sql`length(trim(nome)) > 0`),
  ],
);

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "restrict" }),
    /** Prazo padrao sugerido ao criar titulos a receber (dias apos a emissao). */
    prazoPadraoDias: integer("prazo_padrao_dias"),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_clientes_empresa_pessoa").on(tabela.empresaId, tabela.pessoaId),
    index("clientes_empresa_idx").on(tabela.empresaId),
    check("verifica_clientes_prazo", sql`prazo_padrao_dias IS NULL OR prazo_padrao_dias >= 0`),
  ],
);

export const fornecedores = pgTable(
  "fornecedores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "restrict" }),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_fornecedores_empresa_pessoa").on(tabela.empresaId, tabela.pessoaId),
    index("fornecedores_empresa_idx").on(tabela.empresaId),
  ],
);

/** Anexos de uma pessoa (contrato, cadastro). Ver docs/modelo-dados/anexos.md. */
export const anexosPessoas = pgTable(
  "anexos_pessoas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "restrict" }),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    descricao: text("descricao"),
    criadoEm: colunasTecnicas().criadoEm,
  },
  (tabela) => [uniqueIndex("unico_anexos_pessoas").on(tabela.pessoaId, tabela.arquivoId)],
);
