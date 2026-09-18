# ADR-011 — Integracoes por portas e adaptadores

**Status:** Aceita · 2026-09-18

## Contexto

Bancos, Open Finance, contabilidade, e-mail, webhooks e IA sao externos,
mudam com frequencia e sao vendidos separadamente. O nucleo financeiro nao
pode depender de nenhum SDK especifico.

## Decisao

Padrao **portas e adaptadores** ("ports and adapters"/arquitetura hexagonal:
o nucleo define a interface — porta — e cada servico externo ganha uma
implementacao — adaptador):

```
integracoes/<area>/
  contratos/    portas (interfaces) — o nucleo depende SO disto
  provedores/   adaptadores (um por banco/servico) — importam SDKs
  publico.ts    exporta apenas contratos (e gateways)
```

Portas criadas no Gate 2: `ProvedorBancario`, `LeitorExtrato`,
`ExportadorContabil`, `EnviadorEmail`, `ReceptorWebhook`,
`ProvedorInteligenciaArtificial`. A escolha do adaptador acontece em
`src/composicao/` (raiz de composicao), a partir de configuracao e do portao
de recursos. Regras de lint garantem: `modulos/` e `nucleo/` nunca importam
`provedores/`; SDKs de IA e de bancos so dentro de `provedores/`.

Nunca implementar "scraping" bancario. Webhooks: validar assinatura, gravar
bruto, enfileirar tarefa, responder 200.

## Alternativas consideradas

- **Importar SDK direto no modulo** — rejeitado: acopla, impede troca e
  espalha credenciais.
- **Servico de integracao separado desde ja** — prematuro (ADR-001); a
  fronteira atual permite extrair depois.

## Consequencias positivas

- Contratar "integracao com banco X" = escrever um adaptador + ativar no portao.
- Testes dos modulos usam adaptadores falsos.

## Consequencias negativas

- Portas genericas podem nao cobrir peculiaridades de um banco; permitir
  `opcoes` extensiveis nos contratos.

## Riscos

- Lista de pacotes bancarios na regra de lint desatualizada. Mitigacao:
  atualizar a regra ao contratar cada integracao (checklist em
  `docs/arquitetura/integracoes.md`).

## Criterios para revisao futura

Se mais de tres provedores bancarios coexistirem, avaliar extrair
`integracoes/bancarias` como servico (ADR-001).
