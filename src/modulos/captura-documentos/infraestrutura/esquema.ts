import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { colunaDataCivil, colunaInstante, colunasTecnicas } from "@/banco-dados/esquemas/colunas-comuns";
import { arquivos } from "@/nucleo/arquivos/infraestrutura/esquema";
import { user } from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
import { empresas } from "@/nucleo/empresas/infraestrutura/esquema";
import { titulosPagar } from "@/modulos/contas-pagar/infraestrutura/esquema";

/**
 * Categoria: CAPTURA DE DOCUMENTOS (Gate 10)
 *
 * Cada empresa tem um QR code proprio. Quem o escaneia abre uma pagina
 * publica, fotografa nota, recibo ou boleto, e o envio entra numa FILA DE
 * CONFERENCIA ja vinculado a empresa certa — sem login, sem aplicativo.
 *
 * Documento recebido NAO e conta a pagar. Ele fica numa tabela propria, com
 * a propria situacao, e a conta so nasce quando alguem da equipe confere e
 * aprova. Misturar as duas coisas poria documento nao conferido dentro de
 * `titulos_pagar`, que tem aprovacao, baixa, estorno e cancelamento proprios.
 */

/**
 * `arquivado_sem_conferencia` e diferente de `rejeitado` de proposito:
 * rejeitado e um juizo que alguem fez e assinou, com motivo; arquivado e a
 * AUSENCIA de juizo — o documento ficou 90 dias na fila e ninguem olhou. A
 * trilha precisa distinguir os dois, e um arquivado pode ser reaberto.
 */
export const situacaoDocumentoCapturado = pgEnum("situacao_documento_capturado", [
  "pendente_conferencia",
  "aprovado",
  "rejeitado",
  "arquivado_sem_conferencia",
]);

/**
 * O token que vai dentro do QR code. GUARDA-SE SO O HASH, como em `convites`:
 * com o hash, um vazamento deste banco nao da a ninguem o direito de enviar
 * documento em nome de uma empresa.
 *
 * Um token ATIVO por empresa (indice unico parcial). Regerar revoga o
 * anterior na mesma transacao: o QR antigo morre no instante em que o novo
 * nasce. O revogado nao e apagado — fica o registro de quando e por quem.
 */
export const tokensCaptura = pgTable(
  "tokens_captura",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** SHA-256 do token, em hexadecimal. O token em si nunca e gravado. */
    tokenHash: text("token_hash").notNull(),
    /** Limite de envios por hora com este token. Configuravel por empresa; 20 e o padrao. */
    limiteEnviosHora: integer("limite_envios_hora").notNull().default(20),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
    revogadoEm: colunaInstante("revogado_em"),
    revogadoPor: text("revogado_por").references(() => user.id, { onDelete: "restrict" }),
  },
  (tabela) => [
    uniqueIndex("unico_tokens_captura_hash").on(tabela.tokenHash),
    uniqueIndex("unico_tokens_captura_ativo_por_empresa")
      .on(tabela.empresaId)
      .where(sql`revogado_em IS NULL`),
    check("verifica_tokens_captura_hash", sql`token_hash ~ '^[0-9a-f]{64}$'`),
    check("verifica_tokens_captura_limite", sql`limite_envios_hora > 0`),
    check("verifica_tokens_captura_revogacao", sql`(revogado_em IS NULL) = (revogado_por IS NULL)`),
  ],
);

export const documentosCapturados = pgTable(
  "documentos_capturados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    /** Por qual token entrou. Um token revogado continua explicando envios antigos. */
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokensCaptura.id, { onDelete: "restrict" }),
    /** Protocolo legivel ("DC-2026-000123"), gerado por `nucleo/codigos`. E o que quem enviou anota. */
    codigo: text("codigo").notNull(),
    situacao: situacaoDocumentoCapturado("situacao").notNull().default("pendente_conferencia"),
    /** Texto livre de quem enviou. Nunca e interpretado. */
    observacao: text("observacao"),
    /**
     * Chave de acesso da NF-e/NFC-e (44 posicoes). TEXTO, nunca numero: desde
     * a NT 2025.001 o CNPJ pode ser alfanumerico. O CHECK aceita as duas formas.
     *
     * NAO e unica: a mesma chave pode entrar duas vezes de proposito (reenvio
     * apos rejeicao) e a duplicidade e AVISO para a equipe na fila, nunca
     * recusa na pagina publica — que nao pode revelar o que ja entrou.
     */
    chaveAcesso: text("chave_acesso"),
    /** Definida na conferencia. Entra no calculo do marco de retencao. */
    dataCompetencia: colunaDataCivil("data_competencia"),
    /**
     * Marco de retencao, CONGELADO na conferencia (ou no arquivamento): a data
     * mais tardia entre o AAMM da chave, a competencia e o envio, levada a 1o de
     * janeiro do ano seguinte + 5 anos (art. 173, I, CTN). Guarda-se a data
     * resolvida, nao a regra, para que editar a competencia depois nao mude
     * retroativamente quando o conteudo sai.
     */
    dataMarcoRetencao: colunaDataCivil("data_marco_retencao"),
    /**
     * O titulo que a aprovacao criou. SET NULL, e nao RESTRICT, porque
     * `contas_pagar.excluir` apaga o titulo, e este modulo nao pode mudar o
     * comportamento daquele. O vinculo nao se perde: o evento
     * `documento.conferido` na trilha guarda o id do titulo criado.
     */
    tituloPagarId: uuid("titulo_pagar_id").references(() => titulosPagar.id, { onDelete: "set null" }),
    /** Quando entrou (ou reentrou) na fila. E daqui que se conta o abandono; reabrir reinicia. */
    entrouNaFilaEm: colunaInstante("entrou_na_fila_em").notNull().defaultNow(),
    conferidoEm: colunaInstante("conferido_em"),
    conferidoPor: text("conferido_por").references(() => user.id, { onDelete: "restrict" }),
    motivoRejeicao: text("motivo_rejeicao"),
    /** Arquivamento automatico por abandono (tarefa). Sem `_por`: ninguem decidiu. */
    arquivadoEm: colunaInstante("arquivado_em"),
    reabertoEm: colunaInstante("reaberto_em"),
    reabertoPor: text("reaberto_por").references(() => user.id, { onDelete: "restrict" }),
    /** Conteudo dos anexos removido no fim da retencao. A linha e a trilha ficam. */
    expurgadoEm: colunaInstante("expurgado_em"),
    ...colunasTecnicas(),
  },
  (tabela) => [
    uniqueIndex("unico_documentos_capturados_codigo").on(tabela.empresaId, tabela.codigo),
    /** A fila: pendentes da empresa, do mais antigo para o mais novo. */
    index("documentos_capturados_fila_idx").on(tabela.empresaId, tabela.situacao, tabela.entrouNaFilaEm),
    /** Aviso de duplicidade: "esta chave ja entrou nesta empresa?" */
    index("documentos_capturados_chave_idx").on(tabela.empresaId, tabela.chaveAcesso),
    /** Expurgo: "o que venceu e ainda tem conteudo?" */
    index("documentos_capturados_retencao_idx")
      .on(tabela.dataMarcoRetencao)
      .where(sql`expurgado_em IS NULL AND data_marco_retencao IS NOT NULL`),
    check(
      "verifica_documentos_capturados_chave",
      sql`chave_acesso IS NULL OR chave_acesso ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'`,
    ),
    check("verifica_documentos_capturados_conferencia", sql`(conferido_em IS NULL) = (conferido_por IS NULL)`),
    check("verifica_documentos_capturados_reabertura", sql`(reaberto_em IS NULL) = (reaberto_por IS NULL)`),
    check("verifica_documentos_capturados_rejeicao", sql`situacao <> 'rejeitado' OR motivo_rejeicao IS NOT NULL`),
    check(
      "verifica_documentos_capturados_decisao",
      sql`situacao NOT IN ('aprovado', 'rejeitado') OR conferido_em IS NOT NULL`,
    ),
    check("verifica_documentos_capturados_arquivamento", sql`situacao <> 'arquivado_sem_conferencia' OR arquivado_em IS NOT NULL`),
  ],
);

/** Vinculo documento -> arquivo, no padrao `anexos_<entidade>` (docs/modelo-dados/anexos.md). */
export const anexosDocumentosCapturados = pgTable(
  "anexos_documentos_capturados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentoId: uuid("documento_id").notNull(),
    arquivoId: uuid("arquivo_id")
      .notNull()
      .references(() => arquivos.id, { onDelete: "restrict" }),
    /** Ordem em que a pessoa enviou: a frente da nota antes do verso. */
    ordem: integer("ordem").notNull(),
    criadoEm: colunaInstante("criado_em").notNull().defaultNow(),
  },
  (tabela) => [
    /*
     * Nome dado a mao: o que o Drizzle geraria
     * ("anexos_documentos_capturados_documento_id_documentos_capturados_id_fk")
     * tem 69 caracteres, e o PostgreSQL trunca identificadores em 63 — em
     * silencio, com um NOTICE. Um nome truncado no banco e outro no snapshot
     * do Drizzle e um diff fantasma esperando a proxima migracao.
     */
    foreignKey({
      name: "anexos_documentos_capturados_documento_fk",
      columns: [tabela.documentoId],
      foreignColumns: [documentosCapturados.id],
    }).onDelete("restrict"),
    uniqueIndex("unico_anexos_documentos_capturados").on(tabela.documentoId, tabela.arquivoId),
    check("verifica_anexos_documentos_capturados_ordem", sql`ordem >= 0`),
  ],
);

/**
 * Limite de tentativas da pagina publica, em Postgres — nao ha Redis.
 *
 * Uma linha por (identificador, janela de uma hora). `identificador` e o
 * hash do token OU o IP anonimizado (HMAC), nunca o IP em claro. Cada
 * tentativa e um `INSERT ... ON CONFLICT DO UPDATE SET contador = contador + 1`:
 * uma ida ao banco, uma linha, contencao so entre pedidos do mesmo
 * identificador. A limpeza das janelas velhas e uma tarefa periodica.
 *
 * SEM `empresa_id`, de proposito: um pedido que falhou na porta (token
 * invalido) nao tem empresa, e atribuir uma exigiria confiar no token que
 * acabou de ser recusado. E controle tecnico, como `tarefas`, nao dado
 * financeiro.
 */
export const tentativasCaptura = pgTable(
  "tentativas_captura",
  {
    identificador: text("identificador").notNull(),
    janelaIniciadaEm: colunaInstante("janela_iniciada_em").notNull(),
    contador: integer("contador").notNull().default(0),
  },
  (tabela) => [
    primaryKey({ name: "tentativas_captura_pk", columns: [tabela.identificador, tabela.janelaIniciadaEm] }),
    check("verifica_tentativas_captura_contador", sql`contador >= 0`),
  ],
);
