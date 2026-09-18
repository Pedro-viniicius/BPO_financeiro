-- ============================================================================
-- Comentarios (COMMENT ON) nas estruturas criticas do modelo financeiro.
-- Sao curtos e em portugues: aparecem em ferramentas de banco (psql \d+, DBeaver).
-- A documentacao completa esta em docs/modelo-dados/.
-- ============================================================================
COMMENT ON TABLE pessoas IS 'Identidade de pessoas fisicas/juridicas da organizacao. Clientes e fornecedores sao papeis desta pessoa.';
--> statement-breakpoint
COMMENT ON COLUMN pessoas.cpf_cnpj IS 'Somente digitos (11 CPF / 14 CNPJ). Unico por organizacao.';
--> statement-breakpoint
COMMENT ON TABLE clientes IS 'Papel de cliente que uma pessoa exerce perante uma empresa.';
--> statement-breakpoint
COMMENT ON TABLE fornecedores IS 'Papel de fornecedor que uma pessoa exerce perante uma empresa.';
--> statement-breakpoint
COMMENT ON TABLE contas_bancarias IS 'Onde a empresa guarda dinheiro: conta corrente, poupanca, pagamento, aplicacao ou caixa em especie. Saldo e derivado das movimentacoes.';
--> statement-breakpoint
COMMENT ON COLUMN contas_bancarias.saldo_inicial IS 'Saldo na data de corte. Unico saldo gravado; o atual e calculado.';
--> statement-breakpoint
COMMENT ON TABLE categorias_financeiras IS 'O QUE e o gasto/receita, na lingua do dono (ex.: Energia eletrica). Aponta para uma conta do plano.';
--> statement-breakpoint
COMMENT ON TABLE contas_plano IS 'Plano de contas gerencial: define a linha da DRE (grupo_dre) de cada categoria. Nao e o plano contabil oficial.';
--> statement-breakpoint
COMMENT ON TABLE centros_custo IS 'QUAL AREA gastou ou gerou (loja, projeto, unidade).';
--> statement-breakpoint
COMMENT ON TABLE titulos_pagar IS 'Obrigacao com fornecedor (nota, boleto, contrato). Situacao pago e derivada das parcelas.';
--> statement-breakpoint
COMMENT ON COLUMN titulos_pagar.data_competencia IS 'Mes/dia a que a despesa pertence economicamente (DRE por competencia).';
--> statement-breakpoint
COMMENT ON COLUMN titulos_pagar.valor_total IS 'Soma de valor_original das parcelas. Mantido pela aplicacao na mesma transacao.';
--> statement-breakpoint
COMMENT ON TABLE parcelas_pagar IS 'Cada vencimento de um titulo a pagar. Vencida e parcial sao derivadas.';
--> statement-breakpoint
COMMENT ON COLUMN parcelas_pagar.valor_pago IS 'Soma do principal dos pagamentos nao estornados. Derivado, mantido na transacao.';
--> statement-breakpoint
COMMENT ON TABLE pagamentos IS 'Ato de pagar (total ou parte de) uma parcela. Imutavel; so pode ser estornado.';
--> statement-breakpoint
COMMENT ON COLUMN pagamentos.valor_pago IS 'O que saiu da conta = principal + juros + multa - desconto (CHECK).';
--> statement-breakpoint
COMMENT ON TABLE titulos_receber IS 'Direito contra cliente (venda, servico). Situacao recebido e derivada das parcelas.';
--> statement-breakpoint
COMMENT ON TABLE parcelas_receber IS 'Cada vencimento de um titulo a receber. Pode ser dada como perdida (baixa por perda).';
--> statement-breakpoint
COMMENT ON TABLE recebimentos IS 'Ato de receber (total ou parte de) uma parcela. Imutavel; so pode ser estornado.';
--> statement-breakpoint
COMMENT ON TABLE movimentacoes_bancarias IS 'O que o SISTEMA entende que entrou/saiu de uma conta. Imutavel; estorno cria movimentacao inversa.';
--> statement-breakpoint
COMMENT ON COLUMN movimentacoes_bancarias.valor IS 'Sempre positivo; o sentido esta em tipo (entrada/saida).';
--> statement-breakpoint
COMMENT ON TABLE extratos_bancarios IS 'Um arquivo de extrato importado. Mesma impressao digital nao importa duas vezes na mesma conta.';
--> statement-breakpoint
COMMENT ON TABLE itens_extrato_bancario IS 'O que o BANCO informou, linha a linha. Identificador externo unico por conta.';
--> statement-breakpoint
COMMENT ON TABLE conciliacoes_bancarias IS 'Decisao ligando N itens de extrato a N movimentacoes. Desfazer marca desfeita_em; nada e apagado.';
--> statement-breakpoint
COMMENT ON TABLE dividas IS 'Emprestimos e financiamentos. Saldo devedor = principal - amortizacao paga (derivado).';
--> statement-breakpoint
COMMENT ON TABLE itens_orcamento IS 'Valor planejado por mes (competencia dia 1), categoria e centro de custo. Realizado e consultado, nao gravado.';
--> statement-breakpoint
COMMENT ON TABLE arquivos IS 'Metadados de arquivos; o conteudo fica no armazenamento externo (disco ou S3).';
--> statement-breakpoint
COMMENT ON TABLE sequencias_codigo IS 'Contadores para codigos legiveis (CP-2026-000123). Atualizacao com lock de linha.';
--> statement-breakpoint
COMMENT ON TABLE eventos_auditoria IS 'Trilha de auditoria financeira. Somente insercao (gatilho + privilegios).';
