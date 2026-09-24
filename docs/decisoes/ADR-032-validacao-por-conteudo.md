# ADR-032 — Arquivo recebido de fora: validacao pelo conteudo, nunca interpretado

**Status:** Aceita · 2026-09-24 · Complementa a ADR-031 e o modelo de seguranca

## Contexto

A pagina publica de envio e a maior superficie de ataque ja aberta neste
sistema: um endpoint sem autenticacao recebendo binario. Extensao e
`Content-Type` vem de quem envia; nenhum dos dois e evidencia de nada.

## Decisao

**Aceitar so tres tipos, decididos pelos primeiros bytes** — JPEG (`FF D8 FF`),
PNG (`89 50 4E 47 0D 0A 1A 0A`) e PDF (`%PDF-`) — e gravar em
`arquivos.tipo_conteudo` **o que foi detectado**, nunca o declarado.
Divergencia entre declarado e detectado nao e erro: e ignorada, e o detectado
vence. Um `.exe` renomeado para `.jpg`, um HTML com script, um PNG com um byte
trocado: nenhum passa.

**O que acontece com um PDF malformado**, explicitamente: nada. O sistema
**nao interpreta** PDF. Um arquivo que passe pelos cinco bytes iniciais e
esteja corrompido por dentro e guardado como veio, e o estrago fica contido
porque em nenhum momento ele e processado no servidor — sem extracao, sem
renderizacao, sem miniatura. Ao ser servido para a equipe (fatia 5), vai com
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` (ja
global) e o tipo detectado. Quem eventualmente o abre e o leitor de PDF do
computador da pessoa, com a superficie de ataque dele. Na conferencia, um
arquivo que nao abre e rejeitado com motivo. Validar PDF a fundo exigiria
interpretar PDF — precisamente o que nao se quer fazer com conteudo nao
confiavel.

**Limites, em tres camadas, e as tres importam:** o Caddy corta o corpo em
41 MB **so na rota de recebimento** (413, antes de a aplicacao gastar memoria);
o Route Handler confere o `Content-Length` antes de ler o corpo, porque a
demonstracao na Vercel nao tem Caddy na frente; e as regras do dominio
conferem cada arquivo (15 MB) e o envio (40 MB, 10 arquivos) depois de lido.

**Chave de armazenamento com espaco por empresa** (`<empresa>/<ano>/<mes>/<uuid>.bin`),
gerada pelo sistema; o nome original nunca vira caminho. A URL de envio recebe
`Referrer-Policy: no-referrer`, `Cache-Control: no-store` e `noindex`.

## Alternativas consideradas

- **Confiar no `accept` do formulario e no `Content-Type`** — rejeitada: sao
  dicas para o seletor de arquivos, nao validacao.
- **Interpretar o PDF/imagem no servidor para "sanitizar"** — rejeitada: e
  abrir a porta que se quer fechada; toda biblioteca de parsing e superficie
  de ataque.
- **Antivirus no servidor** — nao adotada agora: custo operacional na VPS
  para um ganho que o "nunca interpretar" ja entrega; fica como evolucao
  possivel se o modelo de ameaca mudar.

## Consequencias

- Um JPEG com carga maliciosa embutida passa — passaria em qualquer
  validacao por assinatura. O que se garante e que ele nunca e executado
  nem interpretado aqui.
- `nucleo/arquivos` ganha `detectarTipoPorConteudo`, disponivel a qualquer
  modulo que venha a receber arquivo.
