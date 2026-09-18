# Inteligencia Artificial

> Gate 2 · ADR-010. Codigo em `src/integracoes/inteligencia-artificial/`.

## Regra numero um

> **O sistema calcula. A IA interpreta. A IA so le.**

A IA nunca e fonte de: saldo, DRE, margens, dividas, impostos, conciliacao,
previsao. Esses numeros vem do motor de calculo deterministico dos modulos e
sao entregues a IA ja prontos. A IA explica, compara, aponta anomalias, sugere
cenarios — e devolve texto estruturado.

## Fluxo

```
PostgreSQL
   │
   ▼
Consultas financeiras permitidas   (modulos: caixa, contas, dre, orcamento, capital-giro)
   │  cada uma devolve um resumo agregado, sem dados pessoais
   ▼
Montador de contexto financeiro    (Gate 9; monta ContextoFinanceiro so com o necessario para a pergunta)
   │
   ▼
Politica de dados                  (politica-dados.ts: remove campos fora do contrato;
   │                                bloqueia se houver CPF/e-mail)
   ▼
Gateway de inteligencia artificial (gateway-inteligencia-artificial.ts: unico ponto de chamada)
   │
   ▼
Provedor                           (provedores/: desligado | anthropic | openai | local)
   │
   ▼
Resposta estruturada               (AnaliseFinanceira: conclusao, dadosUsados, premissas,
                                    calculo, incerteza, cenarios, provedor, modelo)
```

## Contratos

```ts
interface ProvedorInteligenciaArtificial {
  readonly nome: string;
  analisar(pergunta: PerguntaFinanceira): Promise<AnaliseFinanceira>;   // unico metodo: leitura
}
```

`ContextoFinanceiro` e o UNICO formato que chega a um provedor. Campos:
`empresa { nomeFantasia, segmento? }`, `periodo`, `moeda`, `caixa?`,
`contasReceber?`, `contasPagar?`, `dreMensal?`, `variacaoOrcamento?`,
`capitalGiro?`, `pontosAtencao?`. Valores monetarios como texto ("12000.00").

Equivalem as "views permitidas" do Gate 2 (`resumo_caixa_ia`,
`resumo_contas_receber_ia`, `resumo_contas_pagar_ia`, `dre_mensal_ia`,
`variacao_orcamento_ia`, `capital_giro_ia`), implementadas como consultas de
aplicacao (nao como views SQL expostas), para que o filtro por empresa e a
politica de dados sejam obrigatorios.

## O que a IA NAO pode fazer

Nao existe metodo no contrato para isso, e a regra de lint impede modulos
financeiros de importar SDKs de IA. Portanto a IA nao pode: pagar, transferir,
alterar dados bancarios, excluir ou cancelar registros, aprovar pagamentos,
mudar vencimentos, executar SQL. Se um dia houver "acao sugerida", ela sera
um botao que o humano clica, passando pela autorizacao normal.

## O que sai da aplicacao (transparencia)

Quando um provedor EXTERNO esta configurado, saem da instalacao:

| Sai | Nao sai |
|---|---|
| nome fantasia da empresa e segmento | razao social, CNPJ, endereco |
| periodo analisado | — |
| totais agregados: saldo, previstos, projetado | lancamentos individuais |
| totais de contas a pagar/receber, quantidade vencida, prazo medio | nomes de clientes/fornecedores, CPF/CNPJ |
| linhas da DRE (valor e % da receita) | descricoes de lancamentos |
| variacoes de orcamento por categoria | centros de custo com nome de pessoa |
| indicadores de capital de giro | dados bancarios (agencia, conta) |
| pontos de atencao em texto (gerados por regra) | dados de funcionarios (folha individual) |
| a pergunta digitada pelo usuario | — |

A politica de dados bloqueia o envio se detectar padrao de CPF ou e-mail em
qualquer texto (testado). O usuario e informado na tela de Analises sobre o
provedor em uso e este quadro.

Com `IA_PROVEDOR=desligado` (padrao) ou sem o recurso `analises_ia` na
licenca, **nada sai**: o `ProvedorDesligado` responde localmente e os
pontos de atencao deterministicos (modulo `indicadores`) continuam.

Modelo local (`IA_PROVEDOR=local`, Modelo C): mesma politica; nada sai da rede.

## Decisoes de pessoal

Analises sobre equipe usam apenas agregados (folha total, % da receita,
capacidade, produtividade). Nunca nomes ou salarios individuais. A IA nao
recomenda desligar pessoas; apresenta comparacoes e cenarios. Decisao e humana.

## Custo e licenca

Consumo de API e cobrado a parte (ADR-013). O gateway registra provedor,
modelo e duracao em log; no Gate 9, `AIAnalysis` guardara tambem tokens
consumidos para prestacao de contas ao cliente.

## Proximos passos (Gate 9)

- Montador de contexto por pergunta.
- Provedores Anthropic e OpenAI (SDK apenas em `provedores/`).
- Validacao de que todo numero citado na resposta existe no contexto.
- Persistencia de `AIAnalysis` e `AIScenario`; cenarios recalculados pelo motor.
