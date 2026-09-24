# Banco de Dados

> Gate 2 · PostgreSQL + Drizzle. ADR-003, ADR-004, ADR-005, ADR-015.

## Principios

1. **PostgreSQL e a dependencia; o provedor nao.** Nenhum recurso proprietario
   de Neon, Supabase, RDS etc. Qualquer PostgreSQL 16+ serve.
2. **Um banco por instalacao (cliente).** Dentro dele, isolamento por empresa.
3. **Toda alteracao de estrutura e uma migracao versionada.** Nunca `ALTER TABLE`
   manual em producao.
4. **Dinheiro em `NUMERIC(15,2)`, nunca `float`/`double`.**
5. **Datas de negocio em `DATE`; instantes tecnicos em `TIMESTAMPTZ` (UTC).**
6. **A aplicacao nao conecta como superusuario.**

## Drizzle: como usamos

```
<modulo>/infraestrutura/esquema.ts     define as tabelas do modulo (pgTable)
src/banco-dados/esquemas/indice.ts     reune todos os esquemas (so re-exporta)
drizzle.config.ts                      aponta para o indice; migracoes em src/banco-dados/migracoes
src/banco-dados/migrar.ts              aplica migracoes (pnpm banco:migrar)
nucleo/banco-dados/conexao.ts          conexao unica + executarEmTransacao
```

Convencoes:
- `casing: "snake_case"`: escreva `criadoEm` no TypeScript, o banco tera `criado_em`.
- Nomes de tabela no plural, em portugues: `empresas`, `eventos_auditoria`,
  `tarefas`. Excecao: tabelas do Better Auth (`user`, `session`...) — ADR-006.
- Colunas de identificacao: `id uuid` gerado pelo banco (`defaultRandom()`).
  Tabelas do Better Auth usam `text` com `gen_random_uuid()::text` (a
  biblioteca exige texto).
- Toda tabela de negocio: `criado_em`, `atualizado_em`; as que aceitam lixeira:
  `excluido_em` (exclusao logica).
- Indices sempre comecando por `empresa_id` nas tabelas financeiras.

Repositorios: o caso de uso conhece a interface (`RepositorioContasPagar`);
a classe `RepositorioContasPagarDrizzle` implementa e recebe um
`ExecutorBancoDados` (conexao ou transacao). Assim o mesmo repositorio
funciona dentro de `executarEmTransacao`.

## Migracoes

Local: `src/banco-dados/migracoes/` (decisao: junto do codigo-fonte porque
os esquemas Drizzle que as geram estao em `src/`, e a imagem Docker copia
`src/` inteiro para rodar o migrador; um diretorio na raiz exigiria copia
separada e configuracao extra).

Fluxo:

```
1. altere <modulo>/infraestrutura/esquema.ts
2. pnpm banco:gerar --name descricao_curta      → 000N_descricao_curta.sql
3. revise o SQL gerado (leia-o; ele e a fonte da verdade)
4. pnpm banco:migrar                             → aplica no banco local
5. versione o .sql e o meta/ junto com o codigo
```

Migracao com SQL proprio (gatilhos, dados): `pnpm banco:gerar --custom --name x`
e edite o arquivo. Exemplo: `0001_protecao_auditoria.sql`.

A CI verifica que nao ha mudanca de esquema sem migracao (`pnpm banco:gerar`
nao pode produzir arquivo novo).

Regras de seguranca (secao 57 do Gate 2): nunca `DROP TABLE`, `TRUNCATE`,
reset de banco ou remocao de migracao ja aplicada em producao. Se uma
migracao destrutiva parecer necessaria, parar e documentar risco, motivo e
estrategia segura (ex.: renomear coluna = criar nova, copiar, trocar leitura,
remover a antiga em migracao posterior).

Tabela de controle: `migracoes_aplicadas` no esquema `public`.

## Usuarios do banco (menor privilegio)

Criados por `scripts/banco/10-criar-usuarios.sh` (roda automaticamente no
primeiro `docker compose up`, lendo as senhas de `BANCO_SENHA_*` no `.env`;
recusa valor vazio ou de exemplo). Nenhuma senha fica em arquivo versionado.

| Usuario | Usado por | Pode | Nao pode |
|---|---|---|---|
| `financeiro_aplicacao` | aplicacao e processo de tarefas (`BANCO_URL`) | SELECT/INSERT/UPDATE/DELETE nas tabelas | criar/alterar tabelas; UPDATE/DELETE/TRUNCATE em `eventos_auditoria` |
| `financeiro_migracao` | `pnpm banco:migrar` (`BANCO_URL_MIGRACAO`) | criar/alterar estrutura (CREATE no banco e no esquema `public`) | apagar auditoria (gatilho bloqueia) |
| `financeiro_backup` | `pg_dump` (`scripts/backup.sh`) | SELECT em tudo | escrever qualquer coisa |
| `financeiro_admin` (superusuario do PostgreSQL) | administrador humano, restauracao | tudo | ser usado pela aplicacao |

Verificado no Gate 2 em PostgreSQL 17 real:
- `financeiro_aplicacao`: INSERT em `eventos_auditoria` ok; UPDATE/DELETE
  → `permission denied`; `CREATE TABLE` → negado.
- `financeiro_migracao`: DELETE em `eventos_auditoria` → bloqueado pelo gatilho
  `auditoria_somente_insercao`.

`ALTER DEFAULT PRIVILEGES` garante que tabelas criadas por migracoes futuras
ja nascem com as permissoes certas.

## Estrutura empresarial e identificadores

```
organizacoes ──< empresas ──< filiais
      │              │
      └──< vinculos_usuario >── user (Better Auth)
```

| Coluna | Onde | Regra |
|---|---|---|
| `empresa_id` | toda tabela financeira | obrigatoria; toda consulta filtra por ela |
| `filial_id` | contas, contas financeiras, centros de custo, caixa | opcional (nulo = empresa inteira) |
| `organizacao_id` | vinculos, modelos compartilhados, auditoria, eventos, tarefas | consulta rapida por grupo; nao vai em tabelas operacionais |

A aplicacao recebe `EscopoEmpresa { organizacaoId, empresaId, filialId? }`
em todo repositorio. **Row Level Security** (RLS: filtro imposto pelo proprio
banco por sessao) sera avaliada no Gate 5 como segunda barreira; hoje o
isolamento e garantido pela camada de repositorio e por testes.

## Dinheiro e datas no banco

| Conceito | Tipo no banco | Tipo no codigo | Conversao |
|---|---|---|---|
| valor monetario | `NUMERIC(15,2)` | `Dinheiro` | driver devolve texto → `Dinheiro.deTexto()`; grava com `paraTexto()` |
| percentual/taxa | `NUMERIC(9,4)` | `Percentual` | idem |
| data de negocio (vencimento, competencia, pagamento...) | `DATE` | `DataCivil` ("AAAA-MM-DD") | texto puro, sem `Date` |
| instante tecnico (criado_em, ocorrido_em) | `TIMESTAMPTZ` | `Date` (UTC) | nativo |
| competencia mensal | `CHAR(7)` "AAAA-MM" ou `DATE` do dia 1 | texto | — |

Por que `DATE` e nao `TIMESTAMPTZ` para vencimento: "vence dia 10" e um fato
do calendario, nao um instante. Guardar como timestamp cria erros de fuso
(vencimento "pulando" para o dia 9 as 21h em UTC-3). O "hoje" da empresa e
calculado no fuso dela (`empresas.fuso_horario`).

## Tabelas criadas no Gate 2

| Tabela | Modulo | Proposito |
|---|---|---|
| `user`, `session`, `account`, `verification`, `two_factor` | autenticacao | Better Auth |
| `organizacoes`, `empresas`, `filiais`, `vinculos_usuario` | empresas | estrutura empresarial e acesso |
| `eventos_auditoria` | auditoria | trilha somente insercao (+ gatilho) |
| `eventos_saida` | eventos | outbox transacional |
| `tarefas` | tarefas | fila de tarefas |
| `migracoes_aplicadas` | drizzle | controle de migracoes |

As tabelas financeiras (37 tabelas: pessoas, contas bancarias, classificacao,
titulos a pagar/receber, movimentacoes, extratos, conciliacao, dividas,
orcamento, arquivos) foram modeladas no Gate 3 seguindo estas regras.
Ver [`../modelo-dados/LEIA-ME.md`](../modelo-dados/LEIA-ME.md) e
[`src/banco-dados/LEIA-ME.md`](../../src/banco-dados/LEIA-ME.md).

## Backup e restauracao

Ver `modelos-deploy.md`, secao "Backup". Resumo: `pg_dump` diario em formato
personalizado com `sha256`, retencao de 30 dias, criptografia GPG opcional,
restauracao testada em banco separado (`scripts/restaurar.sh`).
