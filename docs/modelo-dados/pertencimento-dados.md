# Pertencimento dos Dados (tenancy)

> Single-tenant por instalacao (ADR-005). Dentro da instalacao:
> organizacao → empresa → filial. Cada tabela declara o **menor escopo correto**.
> O teste `estrutura-modelo.teste.ts` garante que toda tabela financeira tem `empresa_id`.

Legenda: **C** = coluna presente e obrigatoria · **o** = coluna opcional · — = nao se aplica.

| Tabela | Instalacao | Organizacao | Empresa | Filial | Observacao |
|---|---|---|---|---|---|
| user, session, account, verification, two_factor | C | — | — | — | identidade e da instalacao; o acesso a empresas vem de vinculos |
| instituicoes_bancarias | C | — | — | — | dado de referencia (Banco do Brasil e o mesmo para todos) |
| tarefas, eventos_saida | C | o | o | — | plataforma; ids apenas para consulta |
| migracoes_aplicadas | C | — | — | — | controle tecnico |
| organizacoes | C | — | — | — | raiz |
| empresas | — | C | — | — | |
| filiais | — | — | C | — | |
| vinculos_usuario | — | C | o | — | empresa nula = todas as empresas da organizacao |
| **pessoas** | — | **C** | — | — | identidade compartilhada pelo grupo; CPF/CNPJ unico por organizacao |
| anexos_pessoas | — | (via pessoa) | — | — | |
| clientes, fornecedores | — | (via pessoa) | **C** | — | papel por empresa |
| contas_plano, categorias_financeiras | — | — | C | — | cada empresa tem seu plano (modelos podem ser copiados) |
| centros_custo | — | — | C | o | filial opcional quando o centro e uma unidade |
| contas_bancarias | — | — | C | o | |
| titulos_pagar, titulos_receber | — | — | C | o | filial opcional (operacao por unidade) |
| parcelas_pagar, parcelas_receber | — | — | C (repetido) | — | `empresa_id` repetido de proposito: consulta "vencidas" sem juncao |
| pagamentos, recebimentos, pagamentos_divida | — | — | C (repetido) | — | fluxo de caixa realizado por empresa/data sem juncao |
| recorrencias_pagar, recorrencias_receber | — | — | C | — | |
| contatos_cobranca | — | — | C | — | |
| movimentacoes_bancarias, transferencias | — | — | C | — | (filial vem da conta) |
| extratos_bancarios | — | — | C | — | |
| itens_extrato_bancario | — | — | (via extrato) | — | tem `conta_bancaria_id` repetido para unicidade do FITID por conta |
| conciliacoes_bancarias | — | — | C | — | |
| conciliacoes_itens_extrato, conciliacoes_movimentacoes | — | — | (via conciliacao) | — | |
| dividas, parcelas_divida | — | — | C | — | |
| orcamentos | — | — | C | — | |
| itens_orcamento | — | — | (via orcamento) | o (via centro) | |
| arquivos | — | — | C | — | |
| sequencias_codigo | — | — | C | — | codigo CP-2026-000001 e por empresa |
| eventos_auditoria | — | o | o | — | nulos quando a acao e da instalacao (ex.: criar organizacao) |

## Regras

1. **`empresa_id` obrigatorio** em toda tabela com valor financeiro ou classificacao.
   Toda consulta de repositorio recebe `EscopoEmpresa` e filtra por ele.
2. **`organizacao_id` apenas** onde o dado e compartilhado pelo grupo (pessoas,
   vinculos) ou em tabelas de plataforma para consulta rapida.
3. **`filial_id` apenas** onde a operacao acontece por unidade. Nulo = "da empresa".
4. Colunas repetidas (`empresa_id` em parcelas/pagamentos; `conta_bancaria_id`
   em itens de extrato) sao desnormalizacoes documentadas. A aplicacao as
   preenche a partir do pai na mesma transacao; um teste de consistencia
   (Gate 5) verificara que nunca divergem.
5. Uma pessoa pode ser cliente de uma empresa e fornecedora de outra do mesmo
   grupo sem duplicar CPF/CNPJ. Entre organizacoes diferentes (clientes
   distintos de um BPO), a mesma pessoa e cadastrada duas vezes — por desenho:
   organizacoes nao compartilham nada.

## O que impede vazamento entre empresas hoje

- Filtro obrigatorio por `empresa_id` na camada de repositorio (`EscopoEmpresa`).
- Chaves estrangeiras: um titulo so referencia fornecedor, categoria e conta
  bancaria existentes — mas **nao** garante que sejam da mesma empresa
  (o PostgreSQL nao verifica "mesmo `empresa_id`" entre tabelas sem chaves
  compostas). Isso e regra da aplicacao, coberta por testes de caso de uso.
- Seguranca por linha (RLS) como segunda barreira: avaliada e adiada (ADR-017).
