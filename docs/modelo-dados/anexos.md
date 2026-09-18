# Anexos e Arquivos

> Boletos, notas, comprovantes, contratos e os proprios arquivos de extrato.
> **O conteudo NAO fica no PostgreSQL**; o banco guarda metadados e a
> referencia. Contrato: `src/nucleo/arquivos/armazenamento-arquivos.ts`.

## Onde cada coisa fica

```
Usuario envia boleto.pdf
        │
        ▼
Armazenamento (fora do banco)          PostgreSQL
  disco local  ou  objetos S3    +     arquivos (metadados)
  <empresa>/2026/09/<uuid>.bin         chave_armazenamento, nome_original,
                                       tipo_conteudo, tamanho_bytes,
                                       impressao_digital (SHA-256), empresa_id
                                                 │
                                                 ▼
                                       anexos_titulos_pagar (titulo_id, arquivo_id)
```

## Por que nao guardar o arquivo no banco

- Backup do banco ficaria enorme e lento (um PDF de 2 MB por boleto).
- Restauracao de um banco com muitos binarios e demorada.
- Servir arquivo direto do banco desperdica conexoes.
- Excecao aceitavel seria arquivo minusculo e critico — nao e o caso.

## Por que tabelas `anexos_<entidade>` e nao uma tabela polimorfica

Alternativa rejeitada: uma tabela `anexos` com `titulo_pagar_id`,
`titulo_receber_id`, `pagamento_id`, ... todos nulaveis. Problemas: o banco
nao consegue garantir que exatamente uma coluna esteja preenchida sem um
CHECK enorme, e cada nova entidade adiciona uma coluna.

Alternativa tambem rejeitada: `entidade TEXT + entidade_id UUID` (polimorfismo
puro) — impede chave estrangeira, ou seja, o banco deixaria de ser guardiao.

Adotado: uma tabela pequena por entidade que aceita anexo, cada uma com FK real:

| Tabela | Liga arquivo a |
|---|---|
| `anexos_titulos_pagar` | titulo a pagar (boleto, nota) |
| `anexos_pagamentos` | pagamento (comprovante) |
| `anexos_titulos_receber` | titulo a receber (nota emitida) |
| `anexos_recebimentos` | recebimento (comprovante) |
| `anexos_dividas` | divida (contrato) |
| `anexos_pessoas` | pessoa (documentos cadastrais) |

Custo: uma tabela nova quando uma entidade passa a aceitar anexo (5 linhas de
esquema). Beneficio: integridade garantida pelo banco e consultas simples.
`extratos_bancarios.arquivo_id` e uma referencia direta (um extrato tem no
maximo um arquivo).

## Tabela `arquivos`

| Campo | Significado |
|---|---|
| `id` | identificador do arquivo no sistema |
| `empresa_id` | dono; toda leitura filtra por ele |
| `chave_armazenamento` | caminho/chave opaca no armazenamento. **Unica.** Nunca derivada do nome original |
| `nome_original` | o que o usuario vera ao baixar ("boleto-energia.pdf") |
| `tipo_conteudo` | media type verificado (application/pdf, image/png...) |
| `tamanho_bytes` | > 0 (CHECK); maximo 15 MB na aplicacao |
| `impressao_digital` | SHA-256 hex (CHECK de formato). Integridade e deteccao de duplicidade |
| `enviado_por_usuario_id` | quem enviou (SET NULL se o usuario for removido) |
| `removido_em` | conteudo apagado do armazenamento (retencao/LGPD); metadados ficam para a auditoria |

## Regras de seguranca

1. Nome original **nunca** vira caminho: a chave e `<empresa>/<ano>/<mes>/<uuid>.bin`
   (testado: `../../boleto.pdf` nao escapa da raiz).
2. Tipos permitidos: PDF, PNG, JPEG, CSV, TXT, OFX, XLSX. Verificacao pelo
   conteudo (assinatura de bytes), nao so pela extensao — Gate 5.
3. Tamanho maximo 15 MB (`TAMANHO_MAXIMO_ARQUIVO_BYTES`).
4. Download sempre com `Content-Disposition: attachment`; nada e executado.
5. Acesso exige permissao no registro pai (quem pode ver o titulo pode ver o
   anexo). A URL nao e segredo: a autorizacao e verificada no servidor.
6. O arquivo e gravado no armazenamento ANTES da transacao; se a transacao
   falhar, uma rotina de limpeza remove arquivos sem metadados (Gate 5).

## Implementacoes

| Adaptador | Quando | Situacao |
|---|---|---|
| `ArmazenamentoArquivosLocal` | Modelos B e C, desenvolvimento | pronto e testado |
| `ArmazenamentoArquivosS3` | Modelo A (armazenamento de objetos compativel com S3) | Gate 5 |

O dominio nunca conhece o adaptador nem SDK de nuvem: recebe
`ArmazenamentoArquivos` pela composicao (ADR-011).

## Backup

| Item | Como |
|---|---|
| Metadados | dentro do `pg_dump` (`scripts/backup.sh`) |
| Conteudo (disco local) | **precisa ser copiado a parte**: volume `arquivos` do compose |
| Conteudo (S3) | versionamento/replicacao do proprio armazenamento |

Um backup do banco sem os arquivos restaura registros com anexos quebrados.
O procedimento em `docs/arquitetura/modelos-deploy.md` inclui o volume.
Verificacao de integridade (Gate 10): comparar `impressao_digital` com o hash
do conteudo restaurado, por amostragem.

## Retencao (LGPD)

Arquivo com `removido_em` preenchido: conteudo apagado, metadados mantidos
(para a auditoria provar que existiu). Arquivo sem nenhum vinculo
(`anexos_*`) por mais de N dias e candidato a remocao — rotina no Gate 10,
junto com a politica de retencao geral.
