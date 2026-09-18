# Autenticacao, primeiro acesso e empresa ativa (Gate 5)

> Gate 5 · Fundacao. Define **quem esta agindo e em qual empresa** antes de
> qualquer modulo financeiro existir. Decisao registrada na
> [ADR-025](../decisoes/ADR-025-contexto-organizacional.md).

---

## 1. O problema que este gate resolve

Todo registro financeiro tem `empresa_id` e toda consulta filtra por ele
(ADR-005). Isso so protege alguem se a resposta a "qual empresa?" vier de um
lugar confiavel. Este gate estabelece a cadeia:

```
usuario autenticado  →  vinculo ativo  →  empresa ativa  →  papel  →  permissoes
```

e garante que nenhum elo pode ser forjado pelo navegador.

## 2. Estados de quem chega a uma rota

| Estado | Como e determinado | Destino |
|---|---|---|
| **Visitante** | `obterSessaoAtual()` devolve `null` | `/entrar` |
| **Autenticado sem empresa** | sessao valida, nenhum vinculo ativo com empresa ativa | `/primeiro-acesso` |
| **Pronto** | sessao valida + ao menos uma empresa acessivel | `/inicio` (ou a rota pedida) |

A determinacao acontece **no servidor, a cada requisicao**, em
`resolverContextoAplicacao()` (`nucleo/empresas/interface/`). Nao existe cache
de sessao em cookie (ADR-006): revogar um vinculo vale na proxima requisicao.

## 3. Regras de redirecionamento

```
Visitante
    ↓
/entrar ──────────────────────── (ja autenticado? segue a regra abaixo)
    ↓ credenciais validas
Autenticado
    ├── 0 empresas ──→ /primeiro-acesso ──→ cria empresa + vinculo admin ──→ /inicio
    ├── 1 empresa  ──→ /inicio  (empresa vira ativa; sem tela de escolha)
    └── N empresas ──→ /inicio  (empresa ativa resolvida; troca no cabecalho)
```

| Rota | Visitante | Autenticado sem empresa | Pronto |
|---|---|---|---|
| `/` | → `/entrar` | → `/primeiro-acesso` | → `/inicio` |
| `/entrar` | mostra formulario | → `/primeiro-acesso` | → `/inicio` |
| `/criar-conta` | mostra formulario (se cadastro aberto) | → `/primeiro-acesso` | → `/inicio` |
| `/primeiro-acesso` | → `/entrar?retorno=/primeiro-acesso` | mostra instalador | → `/inicio` |
| `(aplicacao)/*` | → `/entrar?retorno=<rota>` | → `/primeiro-acesso` | renderiza |

A funcao pura `decidirDestino(estado, rota)` implementa esta tabela e tem
teste que prova a ausencia de ciclos: para qualquer estado, o destino de um
destino e o proprio destino.

`retorno` so e aceito quando e um caminho **relativo** que comeca com `/` e
nao com `//` (evita redirecionamento aberto). Rotas de entrada (`/entrar`,
`/criar-conta`) nunca sao destino de retorno.

## 4. Primeiro acesso (instalador)

Usuario autenticado sem vinculo cria a primeira empresa. O formulario pede
apenas o que define a fronteira organizacional:

- nome da empresa (obrigatorio);
- nome fantasia (opcional);
- CNPJ (opcional; validado por digito verificador quando informado).

Nada de contas bancarias, saldos, plano de contas, clientes ou fornecedores:
isso e o painel "Comece por aqui" dos Gates 6 e 7.

O caso de uso `instalarPrimeiraEmpresa` (`nucleo/empresas/aplicacao/`) executa
**em uma unica transacao**:

```
validar entrada (Zod)
    ↓
travar o usuario (pg_advisory_xact_lock sobre o id)   ← serializa pedidos simultaneos
    ↓
verificar que o usuario ainda nao tem vinculo ativo   ← senao: UsuarioJaPossuiEmpresa
    ↓
criar organizacao (mesmo nome da empresa)
    ↓
criar empresa
    ↓
criar vinculo (usuario, organizacao, empresa) com papel `administrador`
    ↓
registrar auditoria `empresa.instalada`
    ↓
confirmar
```

Se qualquer passo falhar, nada fica gravado. Dois pedidos simultaneos do mesmo
usuario: o segundo espera o lock, encontra o vinculo criado pelo primeiro e
falha com `UsuarioJaPossuiEmpresa`. A restricao unica
`unico_vinculos_usuario_escopo` (com `NULLS NOT DISTINCT`) e a segunda linha
de defesa.

`/primeiro-acesso` para quem ja tem empresa redireciona para `/inicio`; o caso
de uso recusa de qualquer forma (a tela nao e a protecao).

## 5. Empresa ativa

```
cookie financeiro.empresa-ativa = <empresaId>      ← PREFERENCIA, nunca prova
                    ↓
listarEmpresasAcessiveis(usuarioId)                ← do banco, por vinculo ativo
                    ↓
resolverEmpresaAtiva(acessiveis, preferencia)      ← funcao pura
    - preferencia esta na lista → ela
    - senao, uma unica acessivel → ela
    - senao, a primeira em ordem alfabetica (o usuario troca no cabecalho)
    - lista vazia → sem empresa
```

Consequencias:

- um cookie com o id de uma empresa alheia e **ignorado** (nao esta na lista);
- vinculo desativado → a empresa some da lista na proxima requisicao, mesmo
  com o cookie apontando para ela;
- trocar de empresa (`trocarEmpresaAtiva`) valida contra a lista **antes** de
  gravar o cookie; empresa fora da lista → `UsuarioSemAcessoAEmpresa`, cookie
  intocado;
- modulos futuros nunca leem o cookie: recebem `ContextoUsuario` ja resolvido.

Vinculo com `empresa_id` nulo (toda a organizacao) expande para todas as
empresas ativas daquela organizacao. O papel do vinculo vale para cada uma.

## 6. O contexto que os modulos recebem

```ts
interface ContextoAplicacao {
  sessao: SessaoAtual;                 // quem
  empresaAtiva: EmpresaAcessivel;      // onde (id, nome, organizacao, papel)
  empresasAcessiveis: EmpresaAcessivel[];
  contexto: ContextoUsuario;           // o que ja existia no Gate 2: ids + papel + permissoes efetivas + requisicao
}
```

`ContextoUsuario` (`nucleo/autorizacao`) continua sendo o objeto que os casos
de uso recebem. `exigirPermissao(contexto, ...)` continua sendo a primeira
linha de todo caso de uso. Nenhum caso de uso recebe `empresaId` solto vindo
do navegador.

## 7. Isolamento entre empresas — a regra que nao se negocia

```
Usuario A → Empresa A          Usuario B → Empresa B
A nao le, nao seleciona, nao altera e nao infere nada de B,
mesmo alterando URL, cookie, corpo, query, formulario ou cabecalho.
```

Como se garante:

1. A unica origem de "quais empresas" e `listarEmpresasAcessiveis(usuarioId)`,
   e `usuarioId` vem da sessao (cookie assinado pelo Better Auth), nunca da
   requisicao.
2. A empresa ativa e sempre um elemento dessa lista.
3. Os casos de uso recebem `ContextoUsuario.empresaId` do passo 2, e os
   repositorios filtram por ele (`EscopoEmpresa`).
4. Testes: unitarios para a resolucao (A tenta B → recusado; vinculo removido
   → B some) e de integracao (`src/banco-dados/testes/acesso-empresas.teste.ts`)
   provando a consulta real no PostgreSQL.

## 8. Criacao do primeiro usuario

Sem usuario nao ha quem instale. Regra em `better-auth.ts`
(`databaseHooks.user.create.before`):

- **instalacao vazia** (zero usuarios): cadastro por `/criar-conta` permitido
  em qualquer ambiente;
- **ja existe usuario**: em producao o cadastro publico e recusado (entrada
  por convite, gate posterior); fora de producao continua aberto para
  facilitar testes com varios usuarios.

Isso substitui o antigo `disableSignUp: producao`, que tornava uma instalacao
de producao impossivel de iniciar.

## 9. Fronteira build x runtime

`pnpm build` nao pode depender de PostgreSQL. Regras seguidas:

- nenhum acesso a banco ou a variaveis de ambiente no nivel de modulo:
  `obterAutenticacao()`, `obterBancoDados()` e `obterVariaveisAmbiente()` sao
  preguicosos;
- toda rota que le sessao chama `headers()`/`cookies()` **antes** de tocar
  nesses singletons, o que marca a rota como dinamica e impede a pre-renderizacao;
- as paginas `/entrar`, `/criar-conta`, `/primeiro-acesso`, `/` e `(aplicacao)/*`
  sao dinamicas (`ƒ` na saida do build).

## 10. O que fica para depois

| Item | Gate |
|---|---|
| Convites de usuario e revogacao de vinculo pela interface | autorizacao/usuarios |
| Tela do segundo fator (TOTP) no login | autorizacao/usuarios |
| Redefinicao de senha por e-mail (adaptador SMTP) | integracoes |
| Reautenticacao para acoes sensiveis | autorizacao/usuarios |
| Painel "Comece por aqui" (conta bancaria, saldo, categorias) | 6 e 7 |
| Filial ativa | quando um modulo precisar |
