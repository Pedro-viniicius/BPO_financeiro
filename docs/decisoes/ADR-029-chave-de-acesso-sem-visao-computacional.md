# ADR-029 — Chave de acesso: digitada ou lida pelo navegador, nunca decodificada no servidor

**Status:** Aceita · 2026-09-24 · Complementa a ADR-030 (sem OCR)

## Contexto

A chave de acesso da NF-e/NFC-e (44 posicoes) esta impressa no DANFE, como
codigo de barras CODE-128 e, na NFC-e, dentro da URL do QR code. Ler isso de
uma FOTO e visao computacional: binarizar, achar os padroes de posicao,
corrigir a perspectiva — e a foto de nota amassada em cima do balcao e o pior
caso possivel. Nao e o mesmo problema que gerar um QR (ADR-028), que e
formatacao.

## Decisao

**Nao decodificar no servidor.** O caminho principal e um campo de texto na
pagina publica e na conferencia — 44 posicoes, maiusculas, validadas pelo
**digito verificador** (modulo 11, pesos 2..9, cada caractere valendo
ASCII − 48, o que cobre o CNPJ alfanumerico da NT 2025.001). Chave errada e
recusada na hora, com o motivo; chave em branco e aceita, porque recibo e
boleto nao tem.

**Melhoria progressiva, sem dependencia:** onde o navegador tem
`BarcodeDetector` (Chrome no Android — o aparelho real deste fluxo), a chave e
lida da **imagem ja escolhida**, nunca por `getUserMedia`, nos formatos
`qr_code` e `code_128`. Na NFC-e a chave vem DENTRO da URL do QR
(`...?p=<chave>|...`): extrai-se de la; a URL inteira nao e chave. O campo
nunca e sobrescrito se a pessoa ja digitou, e o valor lido e mostrado para
conferencia. Onde nao ha suporte, o campo continua la.

O que a chave entrega, por posicao e sem OCR: UF, ano-mes de emissao, CNPJ
do emitente, modelo, serie e numero. A tela de conferencia mostra isso, usa
o mes de emissao como competencia sugerida e leva a data de emissao ao marco
de retencao (ADR-019/CTN). **O que a chave nao entrega e o valor total** —
ADR-030.

## Alternativas consideradas

- **Decodificar QR/barras da foto no servidor** — rejeitada: biblioteca de
  visao (dependencia pesada, ADR-014), CPU na VPS, e acuracia ruim no insumo
  real.
- **Exigir a chave** — rejeitada: recibo e boleto nao tem; e obrigar a digitar
  44 posicoes no balcao mata o fluxo. A equipe preenche na conferencia.

## Consequencias

- Zero dependencia e zero processamento de imagem no servidor.
- Em celular sem `BarcodeDetector`, digitar 44 posicoes e chato — mitigado
  pelo campo ser opcional e pela conferencia poder preencher.
- Duplicidade e detectada pela chave, dentro da empresa, como AVISO (ADR-017).
