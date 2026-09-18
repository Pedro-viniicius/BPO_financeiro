# ADR-006 — Better Auth para autenticacao

**Status:** Aceita · 2026-09-18

## Contexto

Autenticacao precisa funcionar sem servico externo (o cliente pode hospedar em
rede local), com e-mail/senha, sessoes revogaveis, redefinicao de senha,
verificacao em duas etapas (TOTP) e "Continuar com Google" opcional. Deve
permitir passkeys, SSO e outros provedores OAuth no futuro.

## Decisao

Usar **Better Auth 1.7** com o adaptador Drizzle sobre o PostgreSQL da
instalacao. Configuracao em `src/nucleo/autenticacao/infraestrutura/better-auth.ts`:

- e-mail + senha: minimo 10 caracteres, hash gerenciado pela biblioteca
  (scrypt), sessoes revogadas ao redefinir senha, token de redefinicao com 30 min;
- sessoes de 7 dias, renovadas com uso, **sem cache em cookie** (cada
  requisicao consulta o banco para que revogacao valha na hora — verificado em
  teste manual: `get-session` devolve `null` imediatamente apos `sign-out`);
- limite de tentativas: 5 logins/min por IP, 3 pedidos de redefinicao/5 min
  (verificado: 6a tentativa recebe HTTP 429);
- plugin `twoFactor` (TOTP + codigos de recuperacao);
- Google via `socialProviders` apenas se as variaveis existirem;
- em producao: cadastro livre desligado (usuarios entram por convite),
  e-mail verificado obrigatorio, cookies `Secure`;
- rotas em `/api/autenticacao/*`; prefixo de cookie `financeiro`.

**Vocabulario externo mantido:** tabelas `user`, `session`, `account`,
`verification`, `two_factor` e os metodos `signIn`, `signUp`, `getSession`
sao da biblioteca e nao foram traduzidos (regra 54 do Gate 2). O resto do
sistema so enxerga `SessaoAtual` (em portugues), montada por
`obterSessaoAtual()`. IDs dessas tabelas sao UUID gerados pelo banco.

Autenticacao responde "quem e"; autorizacao (ADR-007) responde "o que pode".
Sao modulos separados.

## Alternativas consideradas

- **Auth.js (NextAuth)** — bom para OAuth, mas e-mail/senha e TOTP exigem
  muito codigo proprio; sessoes em banco menos ergonomicas.
- **Clerk/Auth0/Supabase Auth** — rejeitados: dependencia de SaaS externo,
  incompativel com servidor local e com licenca perpetua.
- **Implementacao propria** — rejeitada: risco de seguranca alto para o
  beneficio; a biblioteca cobre hash, tokens, CSRF, limites.

## Consequencias positivas

- Sem custo recorrente nem dependencia externa para entrar no sistema.
- Passkeys, SSO/SAML e outros provedores sao plugins da mesma biblioteca.

## Consequencias negativas

- Biblioteca jovem (1.x): acompanhar mudancas. Ela valida o esquema na
  inicializacao e aponta colunas faltantes (ja aconteceu no Gate 2 com
  `two_factor`; corrigido antes da primeira migracao publicada).
- O envio real de e-mail (redefinicao, convite) depende de
  `integracoes/email`, que so ganha adaptador SMTP no Gate 5.

## Riscos

- Reautenticacao para acoes sensiveis ainda nao implementada (Gate 5).

## Criterios para revisao futura

Revisar se a biblioteca deixar de ser mantida ou se surgir exigencia de
SSO corporativo que ela nao cubra.
