# captura-documentos/

Captura de documentos por QR code (Gate 10). Cada empresa tem um QR proprio;
quem o escaneia abre uma pagina publica, fotografa nota, recibo ou boleto, e o
envio entra numa **fila de conferencia** ja vinculado a empresa — sem login.

**Documento recebido nao e conta a pagar.** Ele vive em `documentos_capturados`
com situacao propria; a conta nasce so na aprovacao, pelo `publico.ts` de
contas a pagar, e exige `captura.conferir` **e** `contas_pagar.criar`.

| Pasta | Conteudo |
|---|---|
| `dominio/` | `token-captura.ts` (token de 16 bytes, hash, formato, link) e `envio.ts` (limites do envio, tipos aceitos, mensagens de recusa, formato do protocolo) |
| `aplicacao/` | `repositorio-captura.ts` (contrato), `casos-de-uso-qr.ts` (gerar, revogar, situacao) e `receber-envio.ts` (resolver token, validar, guardar, criar o documento) |
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

Proximas fatias: validacao por conteudo e limites,
fila de conferencia, extracao da chave de acesso, backup e exportacao dos
anexos.
