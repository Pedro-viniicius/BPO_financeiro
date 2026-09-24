# ADR-033 — Escopo de empresa fabricado a partir de token, sem sessao

**Status:** Aceita · 2026-09-24 · Complementa a ADR-017 (isolamento por repositorio) e a ADR-026 (guarda de autorizacao)

## Contexto

Desde o Gate 5, todo `EscopoEmpresa` nasce da sessao: `exigirAcesso` valida
usuario, vinculo e permissao, e so entao entrega o escopo as telas. Nenhuma
pagina monta escopo por conta propria — se o id da empresa pudesse vir de um
parametro de rota, o isolamento acabaria ali.

A captura por QR code quebra a premissa: a pagina `/enviar/<token>` e publica.
Nao ha sessao, nao ha usuario, nao ha permissao. O que ha e um token que
identifica UMA empresa e autoriza UMA coisa: escrever na fila dela.

## Decisao

A invariante da ADR-017 nao e "o escopo vem da sessao". E: **todo repositorio
financeiro recebe `EscopoEmpresa` como primeiro parametro, e existe teste
provando que a empresa A nao enxerga a B.** O token e apenas outra maneira de
*obter* o escopo, e ela acontece em um unico lugar:

- `RepositorioCaptura.resolverEscopoPorToken(hash)` e o unico metodo de
  repositorio do sistema que nao recebe escopo — porque ele o PRODUZ. A
  excecao esta declarada no contrato, no LEIA-ME do modulo e aqui.
- `resolverEnvio()` (camada de aplicacao) e quem o chama: confere o formato
  do token (texto fora do formato nem vira consulta), calcula o hash e troca
  por `{ escopo, tokenId, limite }`. Isso acontece **antes de ler o corpo da
  requisicao**: quem nao passou na porta nao gasta disco nem memoria.
- Abaixo desse ponto, nenhuma linha sabe que houve token. `receberDocumento`
  recebe um `EscopoEmpresa` como qualquer outro metodo e filtra por ele.

**O que o token autoriza, e so isso.** A pagina publica nunca le nada da
empresa: nao lista envios, nao mostra fornecedor, nao confirma se uma chave ja
existe. O aviso de duplicidade e para a equipe, na fila. Quem tem o QR ganha
permissao de ESCREVER na fila daquela empresa e nada mais. Se o QR vazar, o
pior caso e lixo na fila — que a conferencia rejeita —, nunca vazamento de
dado. E a revogacao mata o QR no instante em que acontece.

**Uma so resposta para "nao existe" e "revogado".** Quem escaneou nao tem como
saber a diferenca, e dizer "revogado" confirmaria que aquele token existiu.

## Como o teste de isolamento continua cobrindo

`isolamento-obrigatorio.teste.ts` varre `src/modulos/*/infraestrutura/repositorio-*.ts`
e quebra o build se algum repositorio nao citar `EscopoEmpresa` ou nao tiver
teste de isolamento. O modulo esta em `src/modulos/captura-documentos/`, entao
a cobranca e automatica. O teste de isolamento do modulo prova, com duas
empresas em PostgreSQL real, que o token de A resolve para A, que B nao
enxerga token nem documento de A, e que revogar em B nao toca A.

## Alternativas consideradas

- **Criar uma sessao anonima para o remetente** — rejeitada: e uma sessao sem
  usuario, sem vinculo e sem permissao; teria toda a maquinaria e nenhuma das
  garantias.
- **Passar o `empresa_id` na URL do QR** (em vez de um token) — rejeitada:
  identificador adivinhavel e credencial de escrita para qualquer empresa.
- **Flexibilizar o teste de isolamento** para o modulo — rejeitada: o teste e
  a contrapartida de nao ter RLS; a excecao e de UM metodo, declarada, nao do
  modulo.

## Consequencias

- Um unico ponto de fabricacao de escopo sem sessao, nomeado e testado.
- O limite de tentativas (ADR-031) se apoia nesta ordem: token antes do corpo.
- Qualquer tela futura que precise de escopo sem sessao passa por esta ADR, nao
  por um atalho.
