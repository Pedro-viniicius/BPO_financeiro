# ADR-017 — Seguranca por linha (RLS): avaliada, nao adotada agora

**Status:** Aceita · 2026-09-18 · Reconfirmada no Gate 4 (2026-09-22) · Reavaliar no Gate 10

> "Seguranca por linha" (RLS, *Row-Level Security*) e um recurso do PostgreSQL
> em que o proprio banco filtra as linhas que cada sessao pode ver, com base em
> uma politica. Seria uma segunda barreira contra vazamento entre empresas,
> alem do filtro `empresa_id` da aplicacao.

## Contexto

O produto e single-tenant por instalacao (ADR-005), mas dentro de uma
instalacao ha varias empresas — especialmente em escritorios de BPO, onde a
mesma equipe opera dezenas de clientes no mesmo banco. Hoje o isolamento e
garantido pela camada de repositorio: todo metodo recebe `EscopoEmpresa` e
inclui `WHERE empresa_id = $1`. Um esquecimento em um unico repositorio
poderia expor dados de outra empresa.

Com RLS, uma politica como
`CREATE POLICY isolamento ON titulos_pagar USING (empresa_id = current_setting('financeiro.empresa_id')::uuid)`
faria o banco recusar linhas de outra empresa mesmo que o `WHERE` fosse esquecido.

## Decisao

**Nao adotar RLS agora.** Manter o isolamento na aplicacao, reforcado pelos
controles compensatorios listados abaixo. Reavaliar no Gate 10 (prontidao para
producao) ou antes, se surgir um dos gatilhos.

## Alternativas consideradas

| Opcao | Beneficio | Custo |
|---|---|---|
| **A. Sem RLS (adotada)** | zero complexidade; consultas simples; pool de conexoes normal | um bug de repositorio pode vazar dados entre empresas da mesma instalacao |
| **B. RLS em todas as tabelas com `empresa_id`** | barreira real no banco | ver analise abaixo |
| **C. RLS so nas tabelas mais sensiveis** | parte do beneficio | mesma complexidade operacional, protecao parcial e confusa |
| **D. Um esquema PostgreSQL por empresa** | isolamento forte | migracoes multiplicadas por empresa; consolidacao entre empresas do grupo fica cara; BPO com 30 clientes = 30 esquemas |

## Analise da opcao B (RLS completo)

| Criterio | Avaliacao |
|---|---|
| Protecao | Boa: cobre esquecimento de `WHERE`. **Nao** cobre o erro mais provavel — escrever `empresa_id` errado ao INSERIR (para isso seria preciso `WITH CHECK` em todas as politicas, mais superficie de configuracao) |
| Pool de conexoes | Problema principal: a conexao e reaproveitada entre requisicoes. Seria preciso `SET LOCAL financeiro.empresa_id` no inicio de **toda** transacao e garantir que nenhuma consulta rode fora de transacao. Uma falha nisso derruba consultas legitimas (ou pior, roda com o contexto da requisicao anterior) |
| Migracoes | Cada tabela nova exige `ENABLE ROW LEVEL SECURITY` + politica + teste; esquecer significa tabela desprotegida com falsa sensacao de seguranca |
| Testes | Testes atuais rodam com o usuario da aplicacao; passariam a precisar definir a variavel de sessao em todo teste, aumentando o atrito |
| Desempenho | A politica vira predicado extra em toda consulta; geralmente aproveita o mesmo indice, mas pode atrapalhar planos em consultas com muitas juncoes |
| Compatibilidade com Drizzle | Suportado (a politica e transparente para o ORM), mas `SET LOCAL` precisa ser feito manualmente em cada transacao |
| Manutencao | ~35 tabelas com politica + `WITH CHECK`; revisar a cada gate |
| Risco operacional | O usuario dono da tabela contorna RLS por padrao (`BYPASSRLS`/ownership); seria preciso separar dono (migracao) de usuario da aplicacao com `FORCE ROW LEVEL SECURITY` — mais uma peca para o cliente que hospeda sozinho errar |

Conclusao: o custo recai sobre a operacao (inclusive de clientes sem TI, nos
Modelos B e C), enquanto o beneficio cobre uma classe de erro que ja temos
como impedir de forma mais barata e mais visivel.

## Reconfirmacao no Gate 4 (2026-09-22)

Antes de escrever o primeiro repositorio financeiro, a decisao foi revista com
o que o Gate 3 provou contra PostgreSQL real: o isolamento entre empresas das
consultas de acesso ja e verdadeiro no banco, inclusive contra cookie de
empresa ativa forjado nos dois sentidos.

**Mantida a opcao A** (isolamento na aplicacao). Nada mudou nos custos
analisados abaixo — o problema do pool de conexoes com `SET LOCAL` continua
sendo o mesmo, e agora haveria o agravante de adotar RLS sem nenhuma consulta
financeira escrita para exercitar as politicas.

O que **mudou** foi o peso dos controles compensatorios: os controles 1 e 3
deixaram de ser combinado escrito e viraram teste automatizado em
`src/banco-dados/testes/isolamento-obrigatorio.teste.ts`, que falha a
verificacao quando um `src/modulos/*/infraestrutura/repositorio-*.ts`:

- nao menciona `EscopoEmpresa` (controle 1); ou
- nao tem teste citando o repositorio e a palavra "isolamento" (controle 3).

Hoje nao ha repositorio financeiro concreto, entao a trava passa sem cobrar
nada. No Gate 5 ela morde no primeiro que nascer sem prova de isolamento. Sem
isso, a opcao A dependeria de disciplina; com isso, depende do build.

## Controles compensatorios (o que fazemos em vez de RLS)

1. **`EscopoEmpresa` obrigatorio**: todo metodo de repositorio recebe o escopo
   como primeiro parametro — nao existe assinatura sem ele. Um repositorio que
   nao filtra e visivel em revisao.
2. **Teste estrutural automatizado**: `estrutura-modelo.teste.ts` falha se uma
   tabela financeira for criada sem `empresa_id`.
3. **Testes de isolamento por modulo** (Gate 5+): para cada consulta publica,
   criar duas empresas e provar que a consulta de uma nao devolve dados da outra.
   **Obrigatorio por teste** desde o Gate 4 — ver a reconfirmacao acima.
4. **Revisao de codigo focada**: qualquer novo repositorio passa por conferencia
   do filtro de empresa.
5. **Auditoria com `empresa_id`**: um acesso indevido fica registrado.
6. **Isolamento forte entre CLIENTES** ja existe por instalacao (ADR-005):
   o pior caso de um bug e vazamento entre empresas do mesmo cliente, nao entre
   clientes diferentes.

## Consequencias positivas

- Consultas, testes e operacao continuam simples; nenhuma variavel de sessao.
- Migracoes nao ganham um passo obrigatorio e facil de esquecer.
- Cliente que hospeda sozinho nao precisa entender politicas do PostgreSQL.

## Consequencias negativas

- O banco nao e a ultima barreira contra vazamento entre empresas: a
  responsabilidade e da camada de repositorio (documentado em
  `pertencimento-dados.md`).
- Se um dia um relatorio for escrito em SQL puro fora dos repositorios, ele
  precisa filtrar por empresa explicitamente.

## Riscos

- Alguem escrever consulta ad hoc sem filtro (ex.: rota de exportacao).
  Mitigacao: exportacoes usam os mesmos repositorios; revisao.

## Gatilhos para reavaliar (Gate 10 ou antes)

1. Um incidente real de vazamento entre empresas.
2. Um cliente BPO com mais de ~50 empresas na mesma instalacao.
3. Exigencia contratual/regulatoria de isolamento no banco.
4. Acesso direto ao banco por ferramentas de terceiros (BI do cliente).

Se adotado, a implementacao inclui obrigatoriamente: politicas com `USING` e
`WITH CHECK`, `FORCE ROW LEVEL SECURITY`, `SET LOCAL` em `executarEmTransacao`,
usuario da aplicacao sem posse das tabelas e **testes provando que a empresa A
nao acessa dados da empresa B mesmo com o filtro da aplicacao removido**.
