# ADR-010 — IA somente leitura, por gateway

**Status:** Aceita · 2026-09-18

## Contexto

O produto promete "transformar dados em decisoes compreensiveis". Modelos de
linguagem ajudam a interpretar, mas erram em aritmetica, podem inventar
numeros e, se tiverem acesso ao banco, podem vazar ou alterar dados. O
consumo de API tem custo variavel, incompativel com licenca perpetua se
estiver "incluso".

## Decisao

1. **O sistema calcula; a IA interpreta.** Toda analise recebe um
   `ContextoFinanceiro` JA CALCULADO pelos modulos (motor deterministico) e
   devolve texto estruturado (Conclusao, Dados usados, Premissas, Calculo,
   Incerteza, Cenarios). Nenhum numero novo nasce na IA.
2. **Somente leitura.** O contrato `ProvedorInteligenciaArtificial` tem um
   unico metodo: `analisar`. Nao existe caminho para pagar, cancelar, aprovar,
   alterar datas ou executar SQL.
3. **Gateway unico** (`GatewayInteligenciaArtificial`): contexto → politica de
   dados → provedor. E o unico lugar que chama um provedor.
4. **Politica de dados** (`politica-dados.ts`): remove campos fora do contrato
   e bloqueia envio se detectar CPF ou e-mail no texto. Testada.
5. **Provedor substituivel** em `integracoes/inteligencia-artificial/provedores/`
   (Anthropic, OpenAI, DeepSeek, modelo local). SDKs so podem ser importados
   ali (regra de lint `sdks-de-ia-so-em-provedores`).
6. **Padrao desligado.** Sem licenca do recurso `analises_ia` ou com
   `IA_PROVEDOR=desligado`, o `ProvedorDesligado` responde honestamente e os
   pontos de atencao deterministicos continuam funcionando.
7. **Dados de pessoas** (folha individual, CPF, nomes de funcionarios) nunca
   entram no contexto. Analises de pessoal usam agregados.

## Alternativas consideradas

- **Agente com acesso ao banco (text-to-SQL)** — rejeitado: risco de
  vazamento e de "verdade" inventada; impossivel auditar.
- **Treinar modelo proprio** — rejeitado: custo e sem necessidade.
- **IA "inclusa" na licenca** — rejeitado comercialmente (custo variavel).

## Consequencias positivas

- Auditavel: o contexto enviado e a resposta ficam gravados (`AIAnalysis`, Gate 9).
- Funciona offline (Modelo C) com provedor local ou desligado.

## Consequencias negativas

- Menos "magica": a IA nao explora dados livremente. E intencional.

## Riscos

- Resposta citar numero fora do contexto. Mitigacao no Gate 9: validar que
  todo valor citado existe no contexto antes de exibir.

## Criterios para revisao futura

Ampliar o contexto (ex.: series historicas) somente com nova revisao da
politica de dados e da documentacao de "o que sai da aplicacao".
