# Mapa de Modulos

> Gate 2 · Complementa `docs/domain.md` (Gate 1) com os nomes definitivos em portugues.

## Estrutura interna de um modulo

```
modulo/
  dominio/          Regras de negocio puras. Entidades, situacoes, erros, calculos.
                    NAO importa Next.js, Drizzle, Better Auth, SDKs. Testavel sem nada.
  aplicacao/        Casos de uso ("registrarPagamento", "aprovarConta") e CONTRATOS
                    (interfaces) de repositorio e servicos que o caso de uso precisa.
  infraestrutura/   Implementacoes tecnicas: esquema Drizzle (esquema.ts), repositorios
                    (RepositorioXDrizzle), adaptadores. Unico lugar do modulo que ve o banco.
  interface/        Entradas do modulo: server actions, rotas, componentes de tela.
                    Traduz HTTP/formulario -> caso de uso -> resposta.
  publico.ts        O QUE OUTROS MODULOS PODEM IMPORTAR. Tudo fora daqui e privado.
  LEIA-ME.md        Proposito do modulo, em uma tela.
```

Fluxo de dependencia dentro do modulo: `interface → aplicacao → dominio`;
`infraestrutura` implementa contratos da `aplicacao` (inversao de dependencia).

## Nucleo (plataforma)

| Pasta | Responsabilidade | Estado no Gate 2 |
|---|---|---|
| `nucleo/autenticacao` | Better Auth: e-mail/senha, sessoes, TOTP, Google; `SessaoAtual`; entrar/criar conta/sair | implementado; fluxo verificado no Gate 5 |
| `nucleo/autorizacao` | permissoes, papeis, politica negar-por-padrao, `ContextoUsuario` | implementado + testes |
| `nucleo/empresas` | organizacao → empresa → filial; vinculos; empresa ativa; instalador da primeira empresa; `resolverContextoAplicacao` | implementado + testes (Gate 5) |
| `nucleo/auditoria` | eventos de auditoria somente insercao | implementado + protecao no banco verificada |
| `nucleo/eventos` | eventos de dominio; outbox; entregador | implementado + testes de integracao |
| `nucleo/tarefas` | fila no PostgreSQL; executor; processo de linha de comando | implementado + testes |
| `nucleo/banco-dados` | conexao Drizzle, transacoes, verificacao de saude | implementado |
| `nucleo/configuracao` | variaveis de ambiente validadas (Zod) | implementado + testes |
| `nucleo/observabilidade` | logs estruturados com redacao de segredos | implementado + testes |
| `nucleo/licenciamento` | portao de recursos a partir da licenca | implementado + testes |
| `nucleo/arquivos` | contrato de armazenamento de anexos | contrato |

## Operacao financeira — "O dinheiro entrou ou saiu corretamente?"

| Modulo | Nome no Gate 1 | Conteudo | Estado |
|---|---|---|---|
| `cadastros` | parte de `financial-operations` | clientes, fornecedores | esqueleto |
| `contas-pagar` | `financial-operations` (Payable) | obrigacoes, aprovacao, pagamento, recorrencia, parcelas | situacoes, erros e contrato de repositorio (exemplo do padrao) |
| `contas-receber` | `financial-operations` (Receivable) | direitos, recebimento parcial | esqueleto |
| `cobranca` | `financial-operations` (Collection) | atrasados, contatos, renegociacao | esqueleto |
| `faturamento` | `billing` | fatura gerencial, recibo, referencia PIX/boleto (adaptador) | esqueleto |
| `conciliacao-bancaria` | `reconciliation` | extrato × registros, confianca alta/possivel/revisao | esqueleto |

## Tesouraria — "Tem dinheiro suficiente, no lugar certo e na hora certa?"

| Modulo | Nome no Gate 1 | Conteudo | Estado |
|---|---|---|---|
| `bancos` | `banking` | contas financeiras, saldo inicial, movimentacoes, extratos | esqueleto |
| `caixa` | `treasury` (CashPosition) | posicao de hoje | esqueleto |
| `fluxo-caixa` | `treasury` (CashFlow) | realizado × previsto por dia/semana/mes | esqueleto |
| `previsao-financeira` | `treasury` (CashForecast) | projecao 7/30/90, falta de caixa, premissas | esqueleto |
| `capital-giro` | `treasury` (WorkingCapital) | prazos medios, necessidade de capital de giro | esqueleto |
| `credito-dividas` | `treasury` (Debt) | emprestimos, parcelas, calendario | esqueleto |

## Controle gerencial — "Os numeros estao corretos e o negocio esta performando?"

| Modulo | Nome no Gate 1 | Conteudo | Estado |
|---|---|---|---|
| `plano-contas` | `financial-structure` (Category) | categorias, modelos por segmento, mapeamento para DRE | esqueleto |
| `centros-custo` | `financial-structure` (CostCenter) | centros de custo | esqueleto |
| `dre` | `management-control` (DRE) | DRE gerencial por competencia e caixa | esqueleto |
| `custos-margens` | `management-control` (margens) | fixo/variavel, margens, ponto de equilibrio — **motor de calculo** | esqueleto |
| `orcamento` | `budget` + planejado × realizado | orcamento e comparacao com realizado | esqueleto |
| `indicadores` | `management-control` (KPIs) + pontos de atencao | KPIs explicaveis, alertas por regra | esqueleto |

## Plataforma

| Modulo | Nome no Gate 1 | Conteudo | Estado |
|---|---|---|---|
| `importacao` | `integrations` (ImportJob) | pipeline enviar→...→auditar | esqueleto |
| `exportacao` | `reports` | CSV/PDF, exportacao LGPD | esqueleto |
| `notificacoes` | `notifications` | alertas no app e e-mail | esqueleto |
| `integracoes/*` | `integrations` (adapters) | portas e adaptadores | contratos + gateway de IA |
| `nucleo/tarefas` | (novo) | tarefas em segundo plano | implementado |
| `nucleo/observabilidade` | (novo) | logs | implementado |

## A fronteira da DRE

A DRE **nao possui** dados operacionais. Ela consome, pelos `publico.ts`:

```
contas-pagar ──┐
contas-receber ┤
faturamento ───┼──▶ consultas consolidadas por categoria/competencia ──▶ dre
bancos ────────┤        (regime de caixa usa movimentacoes de bancos)
plano-contas ──┘        (mapeamento categoria → linha da DRE)
```

Se a DRE precisar de um dado que um modulo nao expoe, o modulo ganha uma
consulta no seu `publico.ts`; a DRE nunca le a tabela do outro.

## Onde entra o motor de calculo

Formulas financeiras (margens, ponto de equilibrio, variacao de orcamento,
saldo projetado) vivem **uma vez**, em `custos-margens/dominio/` (margens e
ponto de equilibrio), `orcamento/dominio/` (variacao) e
`previsao-financeira/dominio/` (projecao), como funcoes puras com testes.
Componentes de tela nunca reimplementam formulas. `docs/financial-rules.md`
(Gate 8) documentara cada formula com exemplos numericos.
