# ADR-028 — Geracao de QR code por codigo incorporado

**Status:** Aceita · 2026-09-24 · Complementa a ADR-014 (limites de dependencias)

## Contexto

O Gate 10 da a cada empresa um QR code proprio, impresso ou enviado por
mensagem, que abre a pagina publica de envio de documentos. Gerar QR e
codificar bytes com correcao de erro Reed-Solomon sobre GF(256), escolher uma
de oito mascaras por pontuacao de penalidade e gravar os campos de formato com
BCH. E determinístico e congelado (a norma nao muda desde 2006), mas nao e
pequeno: de 400 a 600 linhas para fazer do zero.

O projeto tem sete dependencias de producao e um precedente forte: ZIP, XLSX e
leitura de CSV foram escritos aqui para nao instalar pacote. So que QR e o
mais dificil dos "escreva voce mesmo", e o pior lugar para um erro sutil — um
QR com a mascara errada le em um celular e falha em outro.

## Decisao

**Copiar o `qrcodegen` do Project Nayuki** (TypeScript, licenca MIT) para
`src/compartilhado/qr/qrcodegen.ts`, com o cabecalho de licenca intacto e
exatamente tres modificacoes locais, declaradas no proprio arquivo:

1. `export` nos tres `namespace`, porque `isolatedModules` exige que todo
   arquivo seja um modulo ES;
2. `@ts-nocheck` na primeira linha, porque `noUncheckedIndexedAccess` — regra
   nossa, mais estrita que a do autor — apontaria 60 indexacoes de array, e
   corrigi-las uma a uma seria reescrever codigo de terceiro;
3. o cabecalho que lista estas modificacoes.

Sobre ele, uma camada nossa (`qr-svg.ts`) decide o que e decisao de produto:
nivel de correcao M, versao maxima 10, zona quieta de 4 modulos, SVG preto
sobre branco.

**Por que "incorporado" nao e "dependencia".** Uma dependencia e codigo que
muda sem a gente: cada `pnpm install` pode trazer outra versao, com outra
arvore transitiva, e cada uma delas e superficie de ataque e trabalho de
atualizacao para sempre (ADR-014). Codigo incorporado fica no nosso controle
de versao, muda so por commit revisado, passa na nossa CI e nao traz nada
junto — o `qrcodegen` nao tem uma dependencia sequer. E para um formato
congelado, "nao muda sem a gente" e exatamente o que se quer.

**Como fica auditavel.** `pnpm verificar:licencas` so enxerga `node_modules`;
por isso ele ganhou um inventario de codigo incorporado, que falha se o
arquivo sumir ou se o aviso de licenca for removido. Um teste reconstroi o
original a partir da copia (tira o cabecalho local e os `export`) e confere o
SHA-256 contra o da origem, registrado no cabecalho: qualquer edicao alem das
tres declaradas reprova. O mesmo teste reproduz o vetor do Anexo I da norma
ISO/IEC 18004 ("01234567", versao 1-M) — os dez codewords de correcao batem
com os da referencia, nao com os da propria biblioteca.

**Validacao feita em 2026-09-24**, com decodificador independente
(`zxing-cpp` em Python, fora do repositorio): quatro textos gerados pelo
`qr-svg.ts` — duas URLs de envio reais, o exemplo da norma e um texto com
acentos — foram rasterizados a partir da matriz e lidos de volta iguais ao
original. Resultado que corrigiu uma estimativa: a URL com o dominio de
producao tem 66 bytes e cai na **versao 5** (37x37), nao na 3 ou 4 — a versao
4 no nivel M para em 62 bytes. Continua pouco densa.

## Alternativas consideradas

- **Escrever do zero**, na linha do ZIP e do XLSX — rejeitada: e a pior
  relacao custo/beneficio entre os tres, e um erro sutil so aparece num
  celular que ninguem testou.
- **Instalar `qrcode` ou similar** — rejeitada: oitava dependencia de producao
  para um formato que nao precisa de atualizacao, com arvore transitiva.
- **Gerar o QR por servico externo** — rejeitada: manda o token de escrita da
  empresa para fora do servidor.

## Consequencias

- 990 linhas de codigo de terceiro no repositorio, tratadas como caixa
  fechada: validadas por decodificador independente e pelo vetor da norma,
  nunca editadas.
- A licenca MIT e cumprida no arquivo e listada em `docs/licenciamento.md`.
- Se um dia for preciso atualizar (improvavel), o caminho e: nova copia,
  reaplicar as tres modificacoes, atualizar o hash no teste e esta ADR.
- **Pendente de validacao fisica**: leitura do QR gerado em celular real, que
  so quem tem o aparelho na mao faz. O decodificador de software prova a
  codificacao; o celular prova a impressao.
