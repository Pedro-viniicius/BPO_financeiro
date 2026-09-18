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
- cadastro publico aberto apenas enquanto a instalacao nao tem usuario;
  depois, em producao, recusado (entrada por convite) — regra em
  `databaseHooks.user.create.before` (Gate 5, ADR-025). Cookies `Secure` em
  producao. Verificacao de e-mail obrigatoria fica para quando existir envio
  de e-mail (`integracoes/email`);
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
- O envio real de e-mail (redefinicao, convite, verificacao) depende de
  `integracoes/email`, que ganha adaptador SMTP em um gate posterior.

## Atualizacao (Gate 5)

- Entrar e criar conta pela interface passam pelo `handler` HTTP da
  biblioteca (nao por `api.signInEmail`), porque so ele aplica o limite de
  tentativas e a verificacao de Origin. *Verificado: a 6a tentativa pelo
  formulario recebe "Muitas tentativas".*
- `SessaoAtual` continua sendo o unico objeto que sai do modulo; a empresa
  ativa e o `ContextoUsuario` sao responsabilidade de `nucleo/empresas`
  (ADR-025).

## Riscos

- Reautenticacao para acoes sensiveis e tela do segundo fator (TOTP) no
  login ainda nao implementadas (gate de usuarios).

## Criterios para revisao futura

Revisar se a biblioteca deixar de ser mantida ou se surgir exigencia de
SSO corporativo que ela nao cubra.
