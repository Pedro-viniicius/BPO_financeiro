# captura-documentos/

Captura de documentos por QR code (Gate 10). Cada empresa tem um QR proprio;
quem o escaneia abre uma pagina publica, fotografa nota, recibo ou boleto, e o
envio entra numa **fila de conferencia** ja vinculado a empresa — sem login.

**Documento recebido nao e conta a pagar.** Ele vive em `documentos_capturados`
com situacao propria; a conta nasce so na aprovacao, pelo `publico.ts` de
contas a pagar, e exige `captura.conferir` **e** `contas_pagar.criar`.

| Pasta | Conteudo |
|---|---|
| `dominio/` | `token-captura.ts` (token, hash, formato, link), `envio.ts` (limites do envio, tipos aceitos, recusas, protocolo), `limite-tentativas.ts` (janela, dois limites) e `conferencia.ts` (situacoes, marcos de retencao, erros da decisao) |
| `aplicacao/` | `repositorio-captura.ts` (contrato), `casos-de-uso-qr.ts`, `receber-envio.ts` e `conferir-documento.ts` (abrir com aviso de duplicidade, aprovar, rejeitar, reabrir); `testes/` tem o repositorio em memoria dos testes de caso de uso |
| `infraestrutura/` | `esquema.ts` (migracao 0010) e `repositorio-captura-drizzle.ts` |

## Regras que este modulo carrega

1. **So o hash do token** vai para o banco (como `convites`). O token em claro
   aparece uma vez, na geracao. "Reimprimir" e gerar outro — e o impresso
   anterior deixa de valer, na mesma transacao.
2. **Um token ativo por empresa**, garantido por indice unico parcial, nao so
   pelo codigo.
3. **`EscopoEmpresa` primeiro em todo metodo do repositorio** (ADR-017), com
   uma excecao declarada: `resolverEscopoPorToken(hash)` e o unico ponto do
   sistema que fabrica um escopo sem sessao (ADR-033). Tudo abaixo dele ignora
   que houve token.
4. A trilha de auditoria registra `qr_captura.gerado` e `qr_captura.revogado`
   com o id do token — nunca o hash.
5. **Arquivos antes do banco.** O recebimento guarda os arquivos no disco e
   so depois grava o documento, numa transacao. Conexao que cai no meio nao
   deixa nada no banco; transacao que falha depois do disco deixa arquivo
   orfao, inofensivo, que a limpeza recolhe. O contrario daria documento
   apontando para arquivo inexistente.
6. **Mesmo conteudo, mesmo arquivo.** Antes de guardar, o SHA-256 e procurado
   entre os arquivos da empresa; se existir, o anexo aponta para ele.
   Reenviar por conexao ruim nao duplica nada.
7. **O envio e um Route Handler, nao uma acao de servidor** (teto de 1 MB), e
   `/enviar/` fica **fora do `proxy.ts`**: requisicao que passa pelo proxy
   tem o corpo limitado a 10 MB pelo Next — descoberto no ensaio, com uma
   foto de 12 MB. O tamanho e conferido pelo `Content-Length` antes de ler.
8. A trilha do envio (`documento.recebido`) tem origem `captura_publica`, sem
   usuario, com o IP so como HMAC (`AUDITORIA_SAL_IP`).
9. **O tipo do arquivo e decidido pelos primeiros bytes** (ADR-032), pelo
   `detectarTipoPorConteudo` de `nucleo/arquivos`. O `Content-Type` declarado
   pelo cliente nem entra no caso de uso. PDF nunca e interpretado no servidor.
11. **A conta a pagar nasce na aprovacao, na MESMA transacao.** O repositorio
    de contas a pagar aceita uma transacao pelo construtor (`ExecutorBancoDados`),
    entao `aprovar` cria o titulo pelo `publico.ts` de la dentro da propria
    transacao e so depois marca o documento — se a marcacao falhar, o titulo
    some junto (provado por teste: chave invalida depois da criacao). Nenhuma
    linha de contas a pagar foi alterada. A conta nasce com UMA parcela, em
    `aberto`, como uma lancada a mao; `contas_pagar.aprovar` continua sendo
    etapa separada. Aprovar exige `captura.conferir` E `contas_pagar.criar`,
    conferidas na acao.
12. **Visualizar nunca muda estado.** Reabrir e acao explicita (rejeitado ou
    arquivado), auditada, que reinicia a contagem de abandono. Aprovado nao
    volta. Duplicidade de chave e AVISO na tela, dentro da empresa.
13. **Arquivos sao servidos sempre como anexo**, com o tipo detectado, nunca
    renderizados (ADR-032).
10. **Dois limites em Postgres** (ADR-031): por token, em envios validos,
    configuravel por empresa (padrao 20/h); por IP, so em tentativas com token
    invalido (10/h). Conferidos antes de ler o corpo. Sem
    `AUDITORIA_SAL_IP` nao ha limite por IP, porque nao se conta pelo IP em
    claro. O Caddy corta o corpo em 41 MB so na rota de recebimento e loga a
    URL com o token apagado.

## Entregue ate agora

- Fatia 1: migracao 0010, permissoes (`captura.*`), vocabulario de auditoria,
  `AUDITORIA_SAL_IP`.
- Fatia 2: token, QR em SVG (`compartilhado/qr`, ADR-028) e a tela
  `/configuracoes/captura` (gerar, revogar, baixar o SVG).
- Fatia 3: pagina publica `/enviar/<token>` (dois campos de arquivo:
  fotografar com `capture`, escolher sem), recebimento em
  `/enviar/<token>/receber`, confirmacao com protocolo, 404 unico para token
  invalido ou revogado (ADR-033). Ensaiada de ponta a ponta sem JavaScript.
  Na Vercel (`AMBIENTE=demonstracao`) a captura fica desligada, com aviso.
- Fatia 4: validacao por conteudo, limites por token e por IP, limite
  configuravel na tela do QR, compressao das fotos no navegador (melhoria
  progressiva, remove EXIF), `request_body` e filtro de log no Caddy.
  Ensaiada por HTTP: `.exe` declarado como JPEG recusado, PDF com nome `.jpg`
  gravado como PDF, 21o envio da hora barrado, 11o token invalido do mesmo IP
  em 429.
- Fatia 5: fila `/captura` (pendentes por padrao, mais antigo primeiro,
  contador de "ha mais de 30 dias"), detalhe com anexos, aviso de duplicidade
  e decisao (aprovar cria a conta a pagar; rejeitar com motivo; reabrir).
  Ensaiada sem JavaScript: aprovacao criou `CP-2026-000001`. A conta a
  RECEBER nao nasce daqui ainda: documento recebido pelo QR e, por ora,
  compromisso com fornecedor.

Proximas fatias: extracao da chave de acesso; backup e exportacao dos anexos;
tarefas de retencao (arquivamento por abandono, expurgo, limpeza de tentativas).
