# nucleo/

Servicos de plataforma que todos os modulos usam, sem regra de negocio financeira.

| Pasta | Responsabilidade | Responde |
|---|---|---|
| `autenticacao/` | Better Auth: e-mail/senha, sessoes, TOTP, Google | Quem e o usuario? |
| `autorizacao/` | permissoes, papeis, politica "negar por padrao" | O que ele pode fazer? |
| `empresas/` | organizacao -> empresa -> filial, vinculos de usuario | Em qual empresa ele age? |
| `auditoria/` | trilha financeira somente insercao | Quem fez o que, quando? |
| `eventos/` | eventos de dominio com outbox transacional | Como modulos reagem uns aos outros? |
| `tarefas/` | fila de tarefas no PostgreSQL e executor | O que roda em segundo plano? |
| `banco-dados/` | conexao Drizzle, transacoes | Como acessar o banco? |
| `configuracao/` | variaveis de ambiente validadas | Como o sistema esta configurado? |
| `observabilidade/` | logs tecnicos estruturados, com redacao | Como operar e diagnosticar? |
| `licenciamento/` | portao de recursos a partir da licenca | Este recurso esta contratado? |
| `arquivos/` | contrato de armazenamento de anexos | Onde ficam os arquivos? |

Regra: `nucleo/` nunca importa `modulos/`. Modulos importam `nucleo/*/publico.ts`.
