# ADR-005 — Single-tenant por instalacao, multiempresa internamente

**Status:** Aceita · 2026-09-18 · Refina a secao 31 do Gate 1

## Contexto

O modelo comercial e licenca perpetua por versao, com hospedagem no cliente
(B/C) ou gerida (A). Um escritorio de BPO financeiro atende varias empresas; um
grupo economico tem varias empresas e filiais. Dados financeiros de clientes
diferentes do fornecedor nunca devem compartilhar o mesmo banco.

## Decisao

**Uma instalacao por cliente** ("single-tenant por instalacao"): cada cliente
(empresa ou escritorio de BPO) tem sua propria aplicacao e seu proprio banco
PostgreSQL. Nao existe banco compartilhado entre clientes diferentes.

**Dentro de uma instalacao**, a estrutura e multiempresa:

```
organizacao   grupo economico ou "cliente" do BPO
  └── empresa   CNPJ; dona dos dados financeiros
        └── filial   unidade operacional (opcional)
```

Regra para identificadores em cada agregado:

| Identificador | Quando usar |
|---|---|
| `empresa_id` | **Obrigatorio** em todo registro financeiro (contas, movimentacoes, orcamentos, extratos, conciliacoes). Toda consulta filtra por ele no servidor. |
| `filial_id` | Somente onde ha operacao por unidade: contas a pagar/receber, contas financeiras, centros de custo, caixa. Nulo = "da empresa como um todo". |
| `organizacao_id` | Cadastros compartilhaveis pelo grupo (vinculos de usuario, modelos de plano de contas) e tabelas de plataforma (auditoria, eventos, tarefas) para consulta rapida sem junção. Nao vai em contas a pagar etc. |

Vinculos de usuario podem ser por empresa ou por organizacao inteira
(`empresa_id` nulo = todas as empresas do grupo), com papel por vinculo.

O Gate 1 falava em "multi-tenant por organizacao"; esta ADR precisa o termo:
o isolamento forte (banco separado) e por instalacao; o isolamento logico
(filtro obrigatorio) e por empresa.

## Alternativas consideradas

- **Multi-tenant em banco unico com `tenant_id`** — rejeitado: incompativel com
  hospedagem no cliente e aumenta o raio de dano de um bug de filtro.
- **Um banco por empresa dentro da instalacao** — rejeitado: BPO com 20
  empresas teria 20 bancos; consolidacao e troca de contexto ficariam caras.

## Consequencias positivas

- Vazamento entre clientes do fornecedor e impossivel por construcao.
- Backup, restauracao e exclusao de dados (LGPD) sao por cliente.
- Consolidacao por grupo e possivel no futuro (mesmo banco).

## Consequencias negativas

- Hospedagem gerida (Modelo A) precisa automatizar a criacao de instancias.
- Atualizacao de versao e feita instalacao por instalacao.

## Riscos

- Esquecer o filtro `empresa_id` em uma consulta. Mitigacao: repositorios
  recebem `EscopoEmpresa` obrigatorio; testes de isolamento no Gate 5; RLS
  como reforco a avaliar.

## Criterios para revisao futura

Se o Modelo A crescer para centenas de instalacoes pequenas, avaliar
"agrupamento" de instancias em um cluster, mantendo um banco por cliente.
