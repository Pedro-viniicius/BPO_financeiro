# ADR-030 — Sem OCR no Gate 10: o valor e digitado na conferencia

**Status:** Aceita · 2026-09-24 · Complementa a ADR-029

## Contexto

Depois de a chave de acesso entregar UF, emissao, emitente, modelo, serie e
numero por posicao (ADR-029), o OCR serviria essencialmente para **um campo**:
o valor total. E o campo mais sensivel do sistema — dinheiro nunca e `float`
e texto vindo de OCR entraria por `Dinheiro.deTextoBrasileiro` de qualquer
forma.

## Decisao

**Nenhum OCR neste gate.** A equipe digita o valor na conferencia, com a
imagem ao lado, no `CampoDinheiro` (texto brasileiro, sem `type="number"`).

## Alternativas consideradas

- **OCR por servico externo** — rejeitada: documento fiscal de cliente
  saindo do servidor. Exige base legal, contrato de operador e aviso no termo
  (LGPD) — para preencher um campo que a pessoa digita em oito segundos.
- **OCR em processo** (Tesseract via WASM ou binario) — rejeitada: sem saida
  de dados, mas centenas de MB e segundos de CPU por pagina numa VPS que ja
  roda banco, aplicacao, tarefas e proxy; e a acuracia em foto de celular
  torta, que e exatamente o insumo, e ruim. Um valor errado que passa e pior
  que um valor digitado.

## Consequencias

- A conferencia continua com digitacao — um campo.
- Nenhuma frente nova de LGPD e nenhum peso novo na VPS.
- Se o volume crescer, o caminho fica aberto e a decisao tera dados reais:
  quantos documentos por dia, quanto tempo por conferencia. Qualquer OCR
  futuro entra pelo mesmo `Dinheiro.deTextoBrasileiro`, com a pessoa
  confirmando, nunca gravando direto.
