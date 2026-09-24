# captura-documentos/

Captura de documentos por QR code (Gate 10). Cada empresa tem um QR proprio;
quem o escaneia abre uma pagina publica, fotografa nota, recibo ou boleto, e o
envio entra numa **fila de conferencia** ja vinculado a empresa — sem login.

**Documento recebido nao e conta a pagar.** Ele vive em `documentos_capturados`
com situacao propria; a conta nasce so na aprovacao, pelo `publico.ts` de
contas a pagar, e exige `captura.conferir` **e** `contas_pagar.criar`.

| Pasta | Conteudo |
|---|---|
| `dominio/` | `token-captura.ts`: token de 16 bytes, hash SHA-256, formato, link de envio |
| `aplicacao/` | `repositorio-captura.ts` (contrato) e `casos-de-uso-qr.ts` (gerar, revogar, situacao) |
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

## Entregue ate agora

- Fatia 1: migracao 0010, permissoes (`captura.*`), vocabulario de auditoria,
  `AUDITORIA_SAL_IP`.
- Fatia 2: token, QR em SVG (`compartilhado/qr`, ADR-028) e a tela
  `/configuracoes/captura` (gerar, revogar, baixar o SVG).

Proximas fatias: pagina publica de envio, validacao por conteudo e limites,
fila de conferencia, extracao da chave de acesso, backup e exportacao dos
anexos.
