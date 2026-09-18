# modulos/

Modulos de negocio do monolito modular. Cada pasta e um contexto delimitado
com fronteira propria; outros modulos so importam o `publico.ts` de cada um.

## Operacao financeira — "O dinheiro entrou ou saiu corretamente?"
| Modulo | Conteudo |
|---|---|
| `cadastros/` | clientes e fornecedores |
| `contas-pagar/` | obrigacoes com fornecedores |
| `contas-receber/` | direitos contra clientes |
| `cobranca/` | gestao de atrasados |
| `faturamento/` | documentos de cobranca, referencias de pagamento |
| `conciliacao-bancaria/` | extrato x registros, com confianca |

## Tesouraria — "Tem dinheiro suficiente, no lugar certo e na hora certa?"
| Modulo | Conteudo |
|---|---|
| `bancos/` | contas financeiras, movimentacoes, extratos |
| `caixa/` | posicao de caixa de hoje |
| `fluxo-caixa/` | realizado x previsto ao longo do tempo |
| `previsao-financeira/` | projecao 7/30/90 dias, falta de caixa |
| `capital-giro/` | prazos medios, necessidade de capital de giro |
| `credito-dividas/` | emprestimos, financiamentos, calendario |

## Controle gerencial — "Os numeros estao corretos e o negocio esta performando?"
| Modulo | Conteudo |
|---|---|
| `plano-contas/` | categorias e mapeamento para a DRE |
| `centros-custo/` | areas / projetos / unidades |
| `dre/` | DRE gerencial (competencia e caixa) |
| `custos-margens/` | fixo/variavel, margens, ponto de equilibrio |
| `orcamento/` | orcamento e planejado x realizado |
| `indicadores/` | KPIs e pontos de atencao |

## Plataforma
| Modulo | Conteudo |
|---|---|
| `importacao/` | pipeline generico de importacao |
| `exportacao/` | exportacoes e relatorios |
| `notificacoes/` | alertas no app e por e-mail |

> "Planejado x realizado" vive dentro de `orcamento/` porque compara o mesmo
> agregado (linhas de orcamento) com o realizado; dois modulos para o mesmo
> agregado criariam duplicidade de regras. A DRE (`dre/`) nao possui dados
> operacionais: consome contas-pagar, contas-receber, faturamento e bancos por
> seus `publico.ts` e consolida.
