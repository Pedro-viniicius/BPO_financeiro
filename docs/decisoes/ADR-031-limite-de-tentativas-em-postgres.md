# ADR-031 — Limite de tentativas da pagina publica em Postgres

**Status:** Aceita · 2026-09-24 · Complementa a ADR-033 (escopo por token)

## Contexto

A pagina `/enviar/<token>` e publica e aceita binario. Sem limite, um QR
vazado ou uma varredura de tokens vira disco cheio e banco cheio. O projeto
nao tem Redis nem dependencia de limite de tentativas, e nao vai ganhar uma
por causa disto (ADR-014).

## Decisao

Uma tabela pequena, `tentativas_captura`, com uma linha por
**(identificador, janela de uma hora)** e um contador. Cada tentativa e um
`INSERT ... ON CONFLICT DO UPDATE SET contador = contador + 1 RETURNING contador`:
uma ida ao banco, uma linha, contencao so entre pedidos do mesmo
identificador. Nao vira gargalo porque o caminho caro do pedido e gravar
megabytes em disco, nao incrementar um inteiro — e duas pessoas enviando ao
mesmo tempo pela mesma empresa e o caso raro.

Dois limites, porque protegem de coisas diferentes:

| Limite | Conta o que | Valor | Por que |
|---|---|---|---|
| por **token** | envios validos (POST) | `limite_envios_hora` do token, padrao 20, **configuravel por empresa** ate 500 | uso legitimo exagerado ou QR vazado |
| por **IP** | so tentativas com token **invalido** (GET ou POST) | 10 por hora, fixo | varredura de tokens |

Envio valido **nao** e limitado por IP, de proposito: CGNAT faz muita gente
legitima dividir o mesmo endereco, e limitar puniria quem esta certo.

**Ordem:** token e limites sao conferidos **antes de ler o corpo** (ADR-033).
Quem nao passou na porta nao gasta disco nem memoria.

**Identificadores nunca sao o IP em claro:** sao o HMAC do IP
(`AUDITORIA_SAL_IP`) ou o hash do token, com prefixo (`ip:`, `token:`) que
separa os dois espacos. Sem sal (desenvolvimento), o limite por IP nao
existe — e o unico caso em que o sistema fica sem essa protecao, e e
consequencia direta de nunca gravar IP em claro.

**Resposta:** limite por token → a pagina mostra "muitos envios na ultima
hora para esta empresa"; limite por IP → 429 seco. Nenhuma das duas revela
numeros.

**Limpeza:** as janelas velhas sao apagadas por tarefa periodica (fatia 7),
junto com as demais rotinas de retencao.

## Alternativas consideradas

- **Contar na memoria do processo** — rejeitada: zera a cada deploy e quebra
  com mais de uma replica.
- **Limitar no Caddy** — rejeitada como unico mecanismo: protege por IP, nao
  sabe o que e token; e a demonstracao na Vercel nao tem Caddy na frente. O
  Caddy corta o TAMANHO (413) antes da aplicacao — isso sim, por rota.
- **Instalar dependencia de rate limit** — rejeitada (ADR-014).

## Consequencias

- Uma tabela de controle tecnico sem `empresa_id`, excecao consciente ao
  padrao, documentada na migracao 0010.
- O limite por empresa e editavel na tela do QR, auditado como
  `configuracao.alterada`.
