# Visao Geral da Arquitetura

> Gate 2 · Para quem chega agora ao projeto. Leia este arquivo primeiro.

## Em uma frase

> Monolito modular, orientado por dominio, single-tenant por instalacao,
> multiempresa internamente, usando Next.js + TypeScript + PostgreSQL + Drizzle.

Traduzindo cada termo:

| Termo | O que significa aqui |
|---|---|
| **Monolito modular** | Uma unica aplicacao para instalar, mas o codigo e dividido em modulos com fronteiras rigidas, verificadas por ferramenta. Nao ha microsservicos. (ADR-001) |
| **Orientado por dominio** | As pastas tem nomes de negocio (`contas-pagar/`, `conciliacao-bancaria/`, `dre/`), nao nomes tecnicos (`controllers/`, `services/`). |
| **Single-tenant por instalacao** | Cada cliente tem sua propria aplicacao e seu proprio banco. (ADR-005) |
| **Multiempresa internamente** | Dentro de uma instalacao: organizacao → empresa → filial. Um escritorio de BPO atende varias empresas no mesmo sistema. |
| **Next.js + TypeScript** | Interface e servidor no mesmo projeto, tudo tipado. (ADR-002) |
| **PostgreSQL + Drizzle** | Banco unico e portavel; acesso tipado; migracoes versionadas. (ADR-003, ADR-004) |

## Mapa do repositorio

```
src/
  app/              rotas e telas do Next.js (camada de interface)
  composicao/       escolhe implementacoes concretas (provedores) a partir da configuracao
  modulos/          MODULOS DE NEGOCIO (contas-pagar, bancos, dre, orcamento...)
  nucleo/           SERVICOS DE PLATAFORMA (autenticacao, autorizacao, auditoria, tarefas...)
  integracoes/      PORTAS E ADAPTADORES para o mundo externo (bancos, IA, e-mail...)
  compartilhado/    conceitos estaveis usados por todos (Dinheiro, DataCivil, erros)
  banco-dados/      agregador de esquemas + migracoes SQL versionadas
docs/
  produto/          Gate 1: escopo, personas, jornadas, glossario, MVP
  domain.md         Gate 1: contextos delimitados e invariantes
  arquitetura/      este diretorio
  decisoes/         ADRs (registros de decisao)
  seguranca/        modelo de seguranca
  licenciamento.md  politica de licenca (nao substitui advogado)
scripts/            backup, restauracao, criacao de usuarios do banco, licencas
```

Cada pasta de primeiro nivel em `src/` tem um `LEIA-ME.md`.

## Como uma requisicao atravessa o sistema

```
Navegador
   │  HTTPS
   ▼
src/app/  (rota ou server action)                      ┐ Interface
   │  exigirContextoAplicacao() → sessao + empresa     │
   │  ativa + ContextoUsuario (nucleo/empresas, Gate 5) │
   ▼                                                    ┘
modulos/<x>/aplicacao/  (caso de uso)                  ┐ Aplicacao
   │  exigirPermissao(contexto, "contas_pagar.pagar")   │
   │  valida entrada (Zod)                              │
   │  chama regras do dominio                           │
   │  usa contratos: RepositorioX, RegistradorAuditoria,│
   │       PublicadorEventos                            │
   ▼                                                    ┘
modulos/<x>/dominio/  (regras puras: Dinheiro, situacoes, erros)  Dominio
   ▲
   │ implementam os contratos
modulos/<x>/infraestrutura/  (RepositorioXDrizzle, esquema)       Infraestrutura
   │
   ▼
PostgreSQL  ── na mesma transacao: dados + eventos_auditoria + eventos_saida
   │
   ▼ (depois, em outro processo)
nucleo/tarefas executor  → entrega eventos_saida → manipuladores de outros modulos
                         → executa tarefas (importar OFX, recalcular previsao...)
```

## Os dois processos

| Processo | Comando | Faz |
|---|---|---|
| `aplicacao` | `pnpm iniciar` / `node server.js` | atende HTTP: telas, rotas, autenticacao |
| `tarefas` | `pnpm tarefas:executar` | entrega eventos da outbox e executa tarefas em segundo plano |

Ambos usam o mesmo codigo e o mesmo banco. No Docker sao dois servicos.

## Principios que a arquitetura protege

1. **Dinheiro nunca e ponto flutuante** — `Dinheiro` (centavos em BigInt). ADR-015.
2. **Datas de negocio sao datas civis** (sem hora/fuso) com nome do significado
   (`vencimento`, `competencia`, `pagamento`). Instantes tecnicos em UTC.
3. **Toda consulta filtra por empresa no servidor.** `EscopoEmpresa` obrigatorio.
4. **Negar por padrao.** Sem permissao explicita, nao. ADR-007.
5. **Auditoria somente insercao,** na mesma transacao da operacao. ADR-008.
6. **Eventos nao se perdem** (outbox transacional). ADR-012.
7. **O sistema calcula; a IA interpreta,** e so le. ADR-010.
8. **Nada externo entra no nucleo:** frameworks so em `infraestrutura/`,
   `interface/`, `app/`, `composicao/`; SDKs so em `provedores/`. ADR-014.
9. **Um codigo, tres modelos de deploy.** ADR-009.
10. **Portugues primeiro** no que e nosso. ADR-016.

## Comandos do dia a dia

```
pnpm dev                     servidor de desenvolvimento
pnpm testar                  testes (Vitest); pnpm testar:observar para modo continuo
pnpm verificar:tipos         TypeScript
pnpm verificar:arquitetura   fronteiras (dependency-cruiser)
pnpm lint                    ESLint
pnpm verificar:licencas      licencas das dependencias
pnpm verificar:tudo          tudo acima + build (o que a CI roda)
pnpm banco:gerar --name x    gera migracao a partir dos esquemas
pnpm banco:migrar            aplica migracoes pendentes
pnpm tarefas:executar        processo de tarefas
```

## Onde continuar a leitura

- `modulos.md` — o que cada modulo faz e a estrutura interna.
- `dependencias.md` — as regras de fronteira e como o lint as aplica.
- `banco-dados.md` — PostgreSQL, Drizzle, migracoes, usuarios, dinheiro e datas.
- `modelos-deploy.md` — hospedagem A/B/C, Docker, backup e restauracao.
- `tarefas.md` — fila, outbox e executor.
- `integracoes.md` — portas e adaptadores.
- `inteligencia-artificial.md` — fluxo da IA e o que sai da aplicacao.
- `../seguranca/modelo-seguranca.md` — seguranca de ponta a ponta.
