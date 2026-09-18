# Provedores de inteligencia artificial

Cada arquivo/pasta implementa `../contratos/provedor-inteligencia-artificial.ts`.

| Provedor | Situacao | Observacao |
|---|---|---|
| `provedor-desligado.ts` | pronto | Padrao. Sem chamadas externas. |
| `anthropic/` | Gate 9 | Chamada via SDK oficial; somente aqui o SDK e importado. |
| `openai/` | Gate 9 | Idem. |
| `local/` | futuro | Modelo rodando na rede do cliente (Modelo C). |

Regras:
- SDKs de IA so podem ser importados dentro desta pasta (verificado por lint).
- Todo provedor recebe apenas o `ContextoFinanceiro` ja filtrado pela politica de dados.
- O contrato e somente leitura: nao existe metodo que altere dados.
