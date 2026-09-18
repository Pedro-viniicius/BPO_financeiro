# Diagrama Geral

> Visao de alto nivel. Diagramas detalhados por categoria estao em `categorias/`.

## Fluxo conceitual

```
ORGANIZACAO ──▶ EMPRESA ──▶ FILIAL
                  │
                  ├── PESSOAS (da organizacao) ──▶ CLIENTES / FORNECEDORES (papeis por empresa)
                  ├── CONTAS BANCARIAS ◀── INSTITUICOES BANCARIAS
                  ├── CLASSIFICACAO: CONTAS DO PLANO ◀── CATEGORIAS ; CENTROS DE CUSTO
                  ├── CONTAS A PAGAR:   titulo ──▶ parcelas ──▶ pagamentos ──▶ MOVIMENTACOES
                  ├── CONTAS A RECEBER: titulo ──▶ parcelas ──▶ recebimentos ──▶ MOVIMENTACOES
                  ├── DIVIDAS:          divida ──▶ parcelas ──▶ pagamentos ──▶ MOVIMENTACOES
                  ├── ORCAMENTO:        orcamento ──▶ itens (mes x categoria x centro)
                  └── EXTRATOS:         extrato ──▶ itens ◀══ CONCILIACAO ══▶ MOVIMENTACOES

DRE gerencial   = titulos/movimentacoes classificados ──▶ categoria ──▶ conta do plano ──▶ linha da DRE
Saldo de conta  = saldo inicial + Σ entradas − Σ saidas  (calculado, nunca gravado)
Auditoria       = quem fez o que, em toda operacao acima (somente insercao)
```

## Diagrama entidade-relacionamento (principais tabelas)

```mermaid
erDiagram
    ORGANIZACOES ||--o{ EMPRESAS : "possui"
    EMPRESAS ||--o{ FILIAIS : "possui"
    ORGANIZACOES ||--o{ PESSOAS : "cadastra"
    PESSOAS ||--o{ CLIENTES : "exerce papel"
    PESSOAS ||--o{ FORNECEDORES : "exerce papel"
    EMPRESAS ||--o{ CLIENTES : "tem"
    EMPRESAS ||--o{ FORNECEDORES : "tem"

    INSTITUICOES_BANCARIAS ||--o{ CONTAS_BANCARIAS : "abriga"
    EMPRESAS ||--o{ CONTAS_BANCARIAS : "possui"

    EMPRESAS ||--o{ CONTAS_PLANO : "define"
    CONTAS_PLANO ||--o{ CATEGORIAS_FINANCEIRAS : "agrupa"
    EMPRESAS ||--o{ CENTROS_CUSTO : "define"

    FORNECEDORES ||--o{ TITULOS_PAGAR : "recebe"
    CATEGORIAS_FINANCEIRAS ||--o{ TITULOS_PAGAR : "classifica"
    TITULOS_PAGAR ||--|{ PARCELAS_PAGAR : "divide em"
    PARCELAS_PAGAR ||--o{ PAGAMENTOS : "recebe"
    PAGAMENTOS ||--|| MOVIMENTACOES_BANCARIAS : "gera saida"

    CLIENTES ||--o{ TITULOS_RECEBER : "deve"
    TITULOS_RECEBER ||--|{ PARCELAS_RECEBER : "divide em"
    PARCELAS_RECEBER ||--o{ RECEBIMENTOS : "recebe"
    RECEBIMENTOS ||--|| MOVIMENTACOES_BANCARIAS : "gera entrada"

    CONTAS_BANCARIAS ||--o{ MOVIMENTACOES_BANCARIAS : "registra"
    CONTAS_BANCARIAS ||--o{ EXTRATOS_BANCARIOS : "importa"
    EXTRATOS_BANCARIOS ||--|{ ITENS_EXTRATO_BANCARIO : "contem"
    CONCILIACOES_BANCARIAS }o--o{ ITENS_EXTRATO_BANCARIO : "liga"
    CONCILIACOES_BANCARIAS }o--o{ MOVIMENTACOES_BANCARIAS : "liga"

    PESSOAS ||--o{ DIVIDAS : "credor"
    DIVIDAS ||--|{ PARCELAS_DIVIDA : "divide em"
    PARCELAS_DIVIDA ||--o{ PAGAMENTOS_DIVIDA : "recebe"

    EMPRESAS ||--o{ ORCAMENTOS : "planeja"
    ORCAMENTOS ||--o{ ITENS_ORCAMENTO : "detalha"
    CATEGORIAS_FINANCEIRAS ||--o{ ITENS_ORCAMENTO : "dimensiona"

    EMPRESAS ||--o{ ARQUIVOS : "guarda"
    ARQUIVOS ||--o{ ANEXOS_TITULOS_PAGAR : "vincula"
```

Legenda Mermaid: `||` exatamente um · `o{` zero ou muitos · `|{` um ou muitos ·
`}o--o{` muitos para muitos (via tabela de vinculo).

## Contagem

| Grupo | Tabelas |
|---|---|
| Gate 2 (autenticacao, empresas, auditoria, eventos, tarefas, migracoes) | 13 |
| Gate 3 — pessoas e classificacao | 7 |
| Gate 3 — bancos, movimentacoes, extratos, conciliacao | 9 |
| Gate 3 — contas a pagar / a receber | 13 |
| Gate 3 — dividas, orcamento | 6 |
| Gate 3 — arquivos e sequencias | 2 |
| **Total** | **50** |
