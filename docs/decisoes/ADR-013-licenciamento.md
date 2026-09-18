# ADR-013 — Licenciamento fora do dominio, via portao de recursos

**Status:** Aceita · 2026-09-18

## Contexto

O cliente compra a versao 1.x com uso perpetuo; IA, integracoes e modulos
futuros sao contratados a parte. As regras comerciais vao mudar; o dominio
financeiro nao pode mudar junto.

## Decisao

- O dominio nunca le licenca. Ele pergunta a um contrato:
  `PortaoRecursos.estaHabilitado(recurso)` (`src/nucleo/licenciamento/`).
- Recursos sao nomes estaveis (`operacao_financeira`, `conciliacao_bancaria`,
  `analises_ia`, `integracao_bancaria`...). Os da versao 1.x sao base; IA e
  integracoes sao "contratados separadamente".
- A licenca e um arquivo `licenca.json` (cliente, versao principal, recursos,
  data, assinatura). **Sem arquivo, a instalacao roda no modo base da versao
  1.x** — o produto nunca fica inutilizavel por falta de um servico do
  fornecedor. Verificacao de assinatura e implementada no Gate 10.
- Nao ha "telefonar para casa" (verificacao online) obrigatorio: e
  incompativel com o Modelo C.
- O texto comercial e juridico esta em `docs/licenciamento.md` e nao substitui
  advogado.

## Alternativas consideradas

- **Verificacao online de licenca** — rejeitada como obrigatoria (servidor
  local, e transforma venda unica em dependencia permanente).
- **Compilar versoes diferentes por contrato** — rejeitada: fork por cliente.
- **Regras de licenca dentro dos casos de uso** — rejeitada: acoplamento.

## Consequencias positivas

- Mudar o que vem em cada plano = mudar a lista de recursos, sem tocar em regras.
- Cliente no modo base tem produto completo da versao comprada.

## Consequencias negativas

- Protecao contra copia e fraca por natureza (o cliente tem o binario e o
  banco). A protecao real e contratual.

## Riscos

- Confundir "recurso habilitado" com "permissao do usuario": sao camadas
  diferentes (licenca da instalacao vs. papel da pessoa). Documentado nas duas.

## Criterios para revisao futura

Revisar ao definir a versao 2.x ou ao lancar o Modelo A em escala.
