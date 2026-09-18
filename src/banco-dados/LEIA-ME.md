# Banco de dados

**Comece por aqui** se voce vai mexer em tabelas, migracoes ou consultas.
A explicacao do NEGOCIO por tras de cada tabela esta em
[`docs/modelo-dados/`](../../docs/modelo-dados/LEIA-ME.md).

## 1. Onde ficam os esquemas

Cada modulo e dono das suas tabelas. O esquema fica junto do modulo, nao em
uma pasta central:

```
src/modulos/contas-pagar/infraestrutura/esquema.ts     titulos_pagar, parcelas_pagar, pagamentos...
src/modulos/contas-receber/infraestrutura/esquema.ts   titulos_receber, parcelas_receber, recebimentos...
src/modulos/bancos/infraestrutura/esquema.ts           contas_bancarias, movimentacoes, extratos...
src/modulos/conciliacao-bancaria/infraestrutura/esquema.ts
src/modulos/cadastros/infraestrutura/esquema.ts        pessoas, clientes, fornecedores
src/modulos/plano-contas/infraestrutura/esquema.ts     contas_plano, categorias_financeiras
src/modulos/centros-custo/infraestrutura/esquema.ts    centros_custo
src/modulos/credito-dividas/infraestrutura/esquema.ts  dividas, parcelas_divida...
src/modulos/orcamento/infraestrutura/esquema.ts        orcamentos, itens_orcamento
src/nucleo/empresas/infraestrutura/esquema.ts          organizacoes, empresas, filiais, vinculos_usuario
src/nucleo/autenticacao/infraestrutura/esquema-better-auth.ts
src/nucleo/auditoria/infraestrutura/esquema.ts         eventos_auditoria
src/nucleo/eventos/infraestrutura/esquema.ts           eventos_saida
src/nucleo/tarefas/infraestrutura/esquema.ts           tarefas
src/nucleo/arquivos/infraestrutura/esquema.ts          arquivos
src/nucleo/codigos/infraestrutura/esquema.ts           sequencias_codigo
```

Nesta pasta ficam apenas as pecas compartilhadas:

```
src/banco-dados/
  esquemas/indice.ts          reune TODOS os esquemas para o Drizzle (so re-exporta)
  esquemas/enumeracoes.ts     enums compartilhados (situacoes, tipos, formas de pagamento)
  esquemas/colunas-comuns.ts  colunaDinheiro, colunaDataCivil, colunaInstante, colunasTecnicas
  migracoes/                  arquivos SQL versionados (NUNCA editados depois de aplicados)
  migrar.ts                   aplica as migracoes (pnpm banco:migrar)
  testes/                     testes de integracao com PostgreSQL real
  LEIA-ME.md                  este arquivo
```

## 2. Esquema x migracao (a diferenca)

| | Esquema (`esquema.ts`) | Migracao (`.sql`) |
|---|---|---|
| O que e | como as tabelas **devem** ser, em TypeScript | o comando que **transforma** o banco de um estado no proximo |
| Quando muda | sempre que voce edita | uma vez, gerada a partir do esquema |
| Pode editar depois | sim | **nao**, se ja foi aplicada em algum lugar |
| Serve para | tipos, consultas, autocompletar | manter todos os bancos iguais |

O esquema e a fonte; a migracao e o caminho. A CI falha se voce alterar o
esquema sem gerar a migracao.

## 3. Como criar uma migracao

```bash
# 1. edite o esquema.ts do modulo
# 2. gere a migracao (o nome vira parte do arquivo; use portugues)
pnpm banco:gerar --name adiciona_campo_x

# 3. LEIA o SQL gerado em src/banco-dados/migracoes/ — ele e a verdade
# 4. aplique no seu banco local
pnpm banco:migrar

# 5. versione o .sql e a pasta meta/ junto com o codigo
```

Migracao com SQL proprio (gatilho, comentario, correcao de dados):

```bash
pnpm banco:gerar --custom --name protecao_x   # cria arquivo vazio para voce escrever
```

**Nunca** edite uma migracao ja aplicada em producao: crie outra.
**Nunca** apague migracoes nem recrie o banco para "resolver" inconsistencia.
Migracao destrutiva (DROP, NOT NULL em tabela com dados): documente risco,
motivo e estrategia antes — ver `docs/arquitetura/banco-dados.md`.

## 4. Como aplicar migracoes

```bash
pnpm banco:migrar     # usa BANCO_URL_MIGRACAO (usuario que pode alterar estrutura)
```

A aplicacao roda com `BANCO_URL` (usuario `financeiro_aplicacao`), que **nao**
pode criar tabelas nem alterar a auditoria. Os papeis sao criados por
`scripts/banco/criar-usuarios.sql`.

## 5. Como rodar os testes de integracao

Eles usam PostgreSQL de verdade — nao simulamos o que o banco deve garantir
(chave estrangeira, CHECK, unicidade, transacao, lock, privilegio).

```bash
# 1. suba um PostgreSQL com os papeis criados
docker run -d --name financeiro-pg \
  -e POSTGRES_DB=financeiro -e POSTGRES_USER=financeiro_admin -e POSTGRES_PASSWORD=admin \
  -p 127.0.0.1:5432:5432 \
  -v "$PWD/scripts/banco/criar-usuarios.sql:/docker-entrypoint-initdb.d/10-criar-usuarios.sql:ro" \
  postgres:17-alpine

# 2. aplique as migracoes
BANCO_URL_MIGRACAO="postgres://financeiro_migracao:troque-esta-senha@127.0.0.1:5432/financeiro" pnpm banco:migrar

# 3. rode os testes apontando para o usuario da APLICACAO
BANCO_URL_TESTE="postgres://financeiro_aplicacao:troque-esta-senha@127.0.0.1:5432/financeiro" pnpm testar
```

Sem `BANCO_URL_TESTE`, esses testes sao pulados (os unitarios rodam normalmente).
Na CI, o PostgreSQL sobe automaticamente e a variavel ja vem definida.

| Arquivo de teste | Prova que |
|---|---|
| `testes/restricoes-integridade.teste.ts` | FK, UNIQUE, CHECK e NOT NULL recusam estados impossiveis |
| `testes/privilegios-banco.teste.ts` | a aplicacao nao cria tabelas nem altera a auditoria |
| `testes/transacoes.teste.ts` | uma falha desfaz tudo; codigo nao e consumido em transacao desfeita |
| `testes/concorrencia.teste.ts` | operacoes simultaneas nao furam a unicidade |
| `testes/estrutura-modelo.teste.ts` | toda tabela financeira tem `empresa_id`; dinheiro e NUMERIC(15,2); datas e instantes nos tipos certos; nomes em portugues |
| `testes/acesso-empresas.teste.ts` | isolamento entre empresas na consulta real; instalacao da primeira empresa atomica e serializada por lock; enum de papel e unicidade `NULLS NOT DISTINCT` |
| `testes/apoio-testes-banco.ts` | (apoio) cenarios e helpers reutilizaveis |

## 6. Convencoes de nomes (resumo)

- Tabelas: plural, portugues, snake_case — `contas_bancarias`, `itens_extrato_bancario`.
- Chave primaria: `id UUID`. Chave estrangeira: `<entidade>_id`.
- Datas de negocio: `data_vencimento`, `data_competencia`, `data_pagamento` (`DATE`).
- Instantes tecnicos: `criado_em`, `estornado_em` (`TIMESTAMPTZ`, UTC).
- Dinheiro: `valor_*`, `saldo_*` (`NUMERIC(15,2)`) — nunca float.
- Unicidade: `unico_<tabela>_<significado>`. CHECK: `verifica_<tabela>_<significado>`.
- Indice: `<tabela>_<colunas>_idx`.

Regra completa: [`docs/modelo-dados/padrao-nomenclatura.md`](../../docs/modelo-dados/padrao-nomenclatura.md).

## 7. Como achar uma tabela

| Procurando por | Vá para |
|---|---|
| contas a pagar, boletos, fornecedores a pagar | `src/modulos/contas-pagar/` · [doc](../../docs/modelo-dados/categorias/contas-pagar.md) |
| contas a receber, cobranca de clientes | `src/modulos/contas-receber/` · [doc](../../docs/modelo-dados/categorias/contas-receber.md) |
| contas bancarias, caixa, saldo, movimentacoes, extrato | `src/modulos/bancos/` · [bancos](../../docs/modelo-dados/categorias/bancos.md), [movimentacoes](../../docs/modelo-dados/categorias/movimentacoes.md), [extratos](../../docs/modelo-dados/categorias/extratos.md) |
| conciliacao | `src/modulos/conciliacao-bancaria/` · [doc](../../docs/modelo-dados/categorias/conciliacao.md) |
| clientes, fornecedores, pessoas | `src/modulos/cadastros/` · [doc](../../docs/modelo-dados/categorias/pessoas.md) |
| categorias, plano de contas, centros de custo | `src/modulos/plano-contas/`, `src/modulos/centros-custo/` · [doc](../../docs/modelo-dados/categorias/classificacao-financeira.md) |
| emprestimos, financiamentos | `src/modulos/credito-dividas/` · [doc](../../docs/modelo-dados/categorias/credito-dividas.md) |
| orcamento, planejado x realizado | `src/modulos/orcamento/` · [doc](../../docs/modelo-dados/categorias/orcamento.md) |
| empresas, filiais, acesso de usuarios | `src/nucleo/empresas/` · [doc](../../docs/modelo-dados/categorias/estrutura-empresarial.md) |
| auditoria | `src/nucleo/auditoria/` · [doc](../../docs/modelo-dados/categorias/auditoria.md) |
| anexos e arquivos | `src/nucleo/arquivos/` · [doc](../../docs/modelo-dados/anexos.md) |
| DRE, margens, caixa projetado | **nao tem tabela**: sao consultas · [dre](../../docs/modelo-dados/categorias/dre.md), [tesouraria](../../docs/modelo-dados/categorias/tesouraria.md) |

## 8. Transacoes

```ts
import { executarEmTransacao } from "@/nucleo/banco-dados/publico";

await executarEmTransacao(async (transacao) => {
  // passe `transacao` para todo repositorio/servico que gravar aqui dentro
});
```

Quem abre a transacao e o **caso de uso**, nunca o repositorio. Repositorios
recebem `ExecutorBancoDados` (conexao ou transacao). Detalhes e a lista das
operacoes que precisam ser atomicas:
[`docs/modelo-dados/transacoes.md`](../../docs/modelo-dados/transacoes.md).

## 9. Diagramas

- Visao geral: [`docs/modelo-dados/diagrama-geral.md`](../../docs/modelo-dados/diagrama-geral.md)
- Por categoria: cada arquivo em [`docs/modelo-dados/categorias/`](../../docs/modelo-dados/categorias/) tem o seu
- Dicionario campo a campo: [`docs/modelo-dados/dicionario-dados.md`](../../docs/modelo-dados/dicionario-dados.md)
- Termos financeiros: [`docs/modelo-dados/glossario.md`](../../docs/modelo-dados/glossario.md)

## 10. Regras que nao se quebram

1. Dinheiro nunca e float — sempre `NUMERIC(15,2)` e `Dinheiro` no codigo.
2. Data de negocio e `DATE`; instante tecnico e `TIMESTAMPTZ` em UTC.
3. Toda tabela financeira tem `empresa_id` e toda consulta filtra por ele.
4. Saldo, "vencida", "parcial", "pago" e saldo devedor sao **calculados**.
5. O que virou historia nao se apaga: cancela, estorna ou desfaz.
6. Auditoria e somente insercao.
7. Migracao versionada sempre; nada de alteracao manual em producao.
