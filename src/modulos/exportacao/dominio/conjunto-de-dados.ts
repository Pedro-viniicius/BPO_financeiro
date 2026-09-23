/**
 * O que sai na exportacao completa, e o porque de cada escolha.
 *
 * A proposta comercial promete que os dados "podem ser exportados a qualquer
 * momento, inclusive ao fim do piloto". Isso so e verdade se o arquivo for
 * SUFICIENTE para reconstruir a operacao em outro lugar — um CSV de
 * demonstrativo nao e; uma lista de titulos sem as parcelas e sem as baixas
 * tambem nao.
 *
 * Por isso a lista abaixo inclui as tabelas de LIGACAO (parcelas, itens,
 * conciliacoes): sao elas que dizem qual pagamento quitou qual parcela, e sem
 * isso o pacote vira um monte de numeros soltos.
 *
 * TRES COISAS NAO SAEM, e nenhuma por esquecimento:
 *   - senha e token (tabelas `account`, `session`, `verification`, `two_factor`
 *     e o `token_hash` dos convites). Sao credenciais; exportar seria entregar
 *     o acesso junto com os dados;
 *   - tabelas de controle interno (`migracoes_aplicadas`, `tarefas`,
 *     `sequencias_codigo`, `eventos_saida`) — dizem respeito ao sistema, nao
 *     ao cliente;
 *   - dados de OUTRAS empresas. Toda consulta filtra por `empresa_id`, e ha
 *     teste provando isso.
 */

export interface ConjuntoExportado {
  /** Nome do arquivo dentro do ZIP, sem extensao. */
  readonly arquivo: string;
  /** Uma linha explicando o que ha ali, para o LEIAME. */
  readonly descricao: string;
  /** Como este arquivo se liga aos outros. Vazio quando nao se liga a nenhum. */
  readonly ligacoes: string;
  /**
   * A consulta. Recebe o id da empresa e o da organizacao como `$1` e `$2`.
   * Escrita em SQL direto porque exportacao e leitura crua: passar por
   * repositorio de dominio traria formatacao e regra que aqui atrapalham.
   */
  readonly consulta: string;
}

/*
 * PESSOAS sao da ORGANIZACAO, nao da empresa (ADR-005): a identidade e
 * compartilhada no grupo economico. Exporta-se quem tem papel NESTA empresa,
 * senao o pacote levaria cadastro de uma empresa irma.
 */
export const CONJUNTOS: readonly ConjuntoExportado[] = [
  {
    arquivo: "empresa",
    descricao: "Os dados cadastrais da empresa, inclusive a data de corte.",
    ligacoes: "É a empresa a que todos os outros arquivos se referem.",
    consulta: `
      SELECT id, nome AS razao_social, nome_fantasia, cnpj, email, telefone,
             cep, logradouro, numero, complemento, bairro, municipio, uf,
             data_inicio_uso AS data_de_corte, fuso_horario, criado_em
      FROM empresas WHERE id = $1`,
  },
  {
    arquivo: "pessoas",
    descricao: "Clientes e fornecedores, com documento e contato.",
    ligacoes: "clientes.pessoa_id e fornecedores.pessoa_id apontam para pessoas.id.",
    consulta: `
      SELECT p.id, p.nome, p.tipo, p.cpf_cnpj, p.email, p.telefone, p.criado_em
      FROM pessoas p
      WHERE p.organizacao_id = $2
        AND (EXISTS (SELECT 1 FROM clientes c WHERE c.pessoa_id = p.id AND c.empresa_id = $1)
          OR EXISTS (SELECT 1 FROM fornecedores f WHERE f.pessoa_id = p.id AND f.empresa_id = $1))
      ORDER BY p.nome`,
  },
  {
    arquivo: "clientes",
    descricao: "O papel de cliente de uma pessoa nesta empresa.",
    ligacoes: "pessoa_id → pessoas.id. titulos_receber.cliente_id → clientes.id.",
    consulta: `SELECT id, pessoa_id, ativo, criado_em FROM clientes WHERE empresa_id = $1`,
  },
  {
    arquivo: "fornecedores",
    descricao: "O papel de fornecedor de uma pessoa nesta empresa.",
    ligacoes: "pessoa_id → pessoas.id. titulos_pagar.fornecedor_id → fornecedores.id.",
    consulta: `SELECT id, pessoa_id, ativo, criado_em FROM fornecedores WHERE empresa_id = $1`,
  },
  {
    arquivo: "plano-de-contas",
    descricao: "As contas do plano e o grupo do demonstrativo a que cada uma pertence.",
    ligacoes: "categorias.conta_plano_id → plano-de-contas.id.",
    consulta: `SELECT id, codigo, nome, grupo_dre, ativa, criado_em FROM contas_plano WHERE empresa_id = $1 ORDER BY codigo`,
  },
  {
    arquivo: "categorias",
    descricao: "As categorias usadas para classificar cada lançamento.",
    ligacoes: "conta_plano_id → plano-de-contas.id. É por ela que o lançamento chega ao resultado.",
    consulta: `SELECT id, nome, conta_plano_id, natureza_custo, ativa, criado_em FROM categorias_financeiras WHERE empresa_id = $1 ORDER BY nome`,
  },
  {
    arquivo: "centros-de-custo",
    descricao: "Centros de custo, quando usados.",
    ligacoes: "titulos_pagar.centro_custo_id e titulos_receber.centro_custo_id.",
    consulta: `SELECT id, codigo, nome, ativo, criado_em FROM centros_custo WHERE empresa_id = $1 ORDER BY codigo`,
  },
  {
    arquivo: "contas-bancarias",
    descricao: "As contas bancárias, com o saldo inicial e a data a que ele se refere.",
    ligacoes: "movimentacoes.conta_bancaria_id aponta para cá.",
    consulta: `
      SELECT c.id, c.nome, c.tipo, i.nome AS instituicao, c.agencia, c.numero_conta,
             c.saldo_inicial, c.data_saldo_inicial, c.ativa, c.criado_em
      FROM contas_bancarias c
      LEFT JOIN instituicoes_bancarias i ON i.id = c.instituicao_bancaria_id
      WHERE c.empresa_id = $1 ORDER BY c.nome`,
  },
  {
    arquivo: "movimentacoes-bancarias",
    descricao: "Todo dinheiro que entrou e saiu das contas, com a origem de cada movimento.",
    ligacoes: "conta_bancaria_id → contas-bancarias.id. movimentacao_estornada_id aponta para a movimentação que este estorno desfez.",
    consulta: `
      SELECT id, conta_bancaria_id, data_movimentacao, tipo, valor, descricao, origem,
             categoria_id, centro_custo_id, movimentacao_estornada_id, observacoes, criado_em
      FROM movimentacoes_bancarias WHERE empresa_id = $1 ORDER BY data_movimentacao, criado_em`,
  },
  {
    arquivo: "transferencias",
    descricao: "Transferências entre contas próprias. Não são receita nem despesa.",
    ligacoes: "conta_origem_id e conta_destino_id → contas-bancarias.id.",
    consulta: `SELECT * FROM transferencias WHERE empresa_id = $1 ORDER BY data_transferencia`,
  },
  {
    arquivo: "titulos-a-pagar",
    descricao: "Os compromissos com fornecedores. O valor total e a situação; as parcelas estão em arquivo próprio.",
    ligacoes: "fornecedor_id → fornecedores.id. categoria_id → categorias.id. parcelas-a-pagar.titulo_pagar_id aponta para cá.",
    consulta: `
      SELECT id, codigo, descricao, fornecedor_id, categoria_id, centro_custo_id, data_competencia,
             valor_total, quantidade_parcelas, situacao, numero_documento, observacoes,
             cancelado_em, motivo_cancelamento, criado_em, atualizado_em
      FROM titulos_pagar WHERE empresa_id = $1 ORDER BY criado_em`,
  },
  {
    arquivo: "parcelas-a-pagar",
    descricao: "Cada parcela de um título a pagar, com vencimento, valor e situação.",
    ligacoes: "titulo_pagar_id → titulos-a-pagar.id. baixas-de-pagamento.parcela_pagar_id aponta para cá.",
    consulta: `
      SELECT id, titulo_pagar_id, numero_parcela, data_vencimento, valor_original,
             situacao, observacoes, criado_em, atualizado_em
      FROM parcelas_pagar WHERE empresa_id = $1 ORDER BY data_vencimento, numero_parcela`,
  },
  {
    arquivo: "baixas-de-pagamento",
    descricao: "Os pagamentos feitos, com juros, multa e desconto. Uma baixa estornada fica aqui, marcada como estornada.",
    ligacoes: "parcela_pagar_id → parcelas-a-pagar.id. movimentacao_bancaria_id → movimentacoes-bancarias.id.",
    consulta: `
      SELECT id, parcela_pagar_id, conta_bancaria_id, movimentacao_bancaria_id, data_pagamento,
             valor_principal, valor_juros, valor_multa, valor_desconto, valor_pago,
             forma_pagamento, situacao, estornado_em, motivo_estorno, movimentacao_estorno_id, criado_em
      FROM pagamentos WHERE empresa_id = $1 ORDER BY data_pagamento, criado_em`,
  },
  {
    arquivo: "titulos-a-receber",
    descricao: "O que a empresa tem a receber de clientes.",
    ligacoes: "cliente_id → clientes.id. categoria_id → categorias.id.",
    consulta: `
      SELECT id, codigo, descricao, cliente_id, categoria_id, centro_custo_id, data_competencia,
             valor_total, quantidade_parcelas, situacao, numero_documento, observacoes,
             cancelado_em, motivo_cancelamento, criado_em, atualizado_em
      FROM titulos_receber WHERE empresa_id = $1 ORDER BY criado_em`,
  },
  {
    arquivo: "parcelas-a-receber",
    descricao: "Cada parcela de um título a receber.",
    ligacoes: "titulo_receber_id → titulos-a-receber.id.",
    consulta: `
      SELECT id, titulo_receber_id, numero_parcela, data_vencimento, valor_original,
             situacao, observacoes, criado_em, atualizado_em
      FROM parcelas_receber WHERE empresa_id = $1 ORDER BY data_vencimento, numero_parcela`,
  },
  {
    arquivo: "baixas-de-recebimento",
    descricao: "Os recebimentos, com juros, multa e desconto concedido.",
    ligacoes: "parcela_receber_id → parcelas-a-receber.id. movimentacao_bancaria_id → movimentacoes-bancarias.id.",
    consulta: `
      SELECT id, parcela_receber_id, conta_bancaria_id, movimentacao_bancaria_id, data_recebimento,
             valor_principal, valor_juros, valor_multa, valor_desconto, valor_recebido,
             forma_pagamento, situacao, estornado_em, motivo_estorno, movimentacao_estorno_id, criado_em
      FROM recebimentos WHERE empresa_id = $1 ORDER BY data_recebimento, criado_em`,
  },
  {
    arquivo: "extratos-importados",
    descricao: "Os arquivos de extrato (OFX) que foram importados.",
    ligacoes: "itens-do-extrato.extrato_id aponta para cá.",
    consulta: `SELECT * FROM extratos_bancarios WHERE empresa_id = $1 ORDER BY importado_em`,
  },
  {
    arquivo: "itens-do-extrato",
    descricao: "Cada linha dos extratos importados.",
    ligacoes: "extrato_bancario_id → extratos-importados.id.",
    consulta: `
      SELECT i.* FROM itens_extrato_bancario i
      JOIN extratos_bancarios e ON e.id = i.extrato_bancario_id
      WHERE e.empresa_id = $1 ORDER BY i.data_movimentacao`,
  },
  {
    arquivo: "conciliacoes",
    descricao: "O casamento entre uma linha do extrato e um lançamento do sistema.",
    ligacoes: "Liga itens-do-extrato a movimentacoes-bancarias pelas tabelas de ligação.",
    consulta: `SELECT * FROM conciliacoes_bancarias WHERE empresa_id = $1 ORDER BY criado_em`,
  },
  {
    arquivo: "orcamentos",
    descricao: "Os orçamentos anuais.",
    ligacoes: "itens-do-orcamento.orcamento_id aponta para cá.",
    consulta: `SELECT * FROM orcamentos WHERE empresa_id = $1 ORDER BY ano`,
  },
  {
    arquivo: "itens-do-orcamento",
    descricao: "O valor planejado por categoria e competência (mês).",
    ligacoes: "orcamento_id → orcamentos.id. categoria_id → categorias.id.",
    consulta: `
      SELECT i.* FROM itens_orcamento i JOIN orcamentos o ON o.id = i.orcamento_id
      WHERE o.empresa_id = $1 ORDER BY o.ano, i.competencia`,
  },
  {
    arquivo: "dividas",
    descricao: "Empréstimos e financiamentos, com taxa e sistema de amortização.",
    ligacoes: "credor_pessoa_id → pessoas.id. cronograma-das-dividas.divida_id aponta para cá.",
    consulta: `SELECT * FROM dividas WHERE empresa_id = $1 ORDER BY data_contratacao`,
  },
  {
    arquivo: "cronograma-das-dividas",
    descricao: "Cada parcela da dívida, separando amortização de juros.",
    ligacoes: "divida_id → dividas.id. parcela_pagar_id → parcelas-a-pagar.id: é a conta a pagar que representa esta parcela.",
    consulta: `SELECT * FROM parcelas_divida WHERE empresa_id = $1 ORDER BY divida_id, numero_parcela`,
  },
  {
    arquivo: "importacoes",
    descricao: "As planilhas importadas na carga inicial, e quais foram desfeitas.",
    ligacoes: "Não se liga a lançamentos neste pacote; serve para explicar a origem dos dados iniciais.",
    consulta: `SELECT id, tipo, arquivo_nome, quantidade, criado_em, desfeito_em, motivo_desfazer FROM lotes_importacao WHERE empresa_id = $1 ORDER BY criado_em`,
  },
  {
    arquivo: "usuarios",
    descricao: "Quem tem acesso e com que papel. SEM senha e SEM token: são credenciais, não dados.",
    ligacoes: "auditoria.usuario_id aponta para cá.",
    consulta: `
      SELECT u.id, u.name AS nome, u.email, v.papel, v.ativo, v.criado_em
      FROM vinculos_usuario v JOIN "user" u ON u.id = v.usuario_id
      WHERE v.organizacao_id = $2 AND (v.empresa_id = $1 OR v.empresa_id IS NULL)
      ORDER BY u.name`,
  },
  {
    arquivo: "auditoria",
    descricao: "Quem fez o quê, quando e por quê. É o que explica qualquer número que mudou.",
    ligacoes: "usuario_id → usuarios.id. entidade_id aponta para o id do registro no arquivo correspondente.",
    consulta: `
      SELECT id, ocorrido_em, usuario_id, acao, entidade, entidade_id, origem, dados_antes, dados_depois
      FROM eventos_auditoria WHERE empresa_id = $1 ORDER BY ocorrido_em`,
  },
];
