# ADR-026 — Guarda unica de autorizacao no servidor

**Status:** Aceita · 2026-09-22 · Complementa a ADR-007 (autorizacao) e a ADR-025 (contexto organizacional)

## Contexto

A ADR-007 definiu a politica (`exigirPermissao`, negar por padrao) e a ADR-025
definiu de onde vem o contexto (`resolverContextoAplicacao`). Faltava a peca do
meio: **o ponto por onde uma requisicao HTTP entra e encontra as duas**.

Ate aqui, uma tela do produto chamava `exigirContextoAplicacao()`, que garante
sessao e empresa ativa — mas **nao verifica permissao**. Uma tela financeira
precisaria lembrar de chamar `exigirPermissao(contexto, "...")` por conta
propria. Esquecer nao quebra nada visivelmente: a tela funciona, so que para
quem nao deveria ve-la.

Dois fatos do App Router agravam isso:

1. **Layout nao protege rota.** Um layout nao volta a renderizar a cada
   navegacao (renderizacao parcial) e nao decide se os demais segmentos
   renderizam — o roteador os renderiza de qualquer forma, e eles aparecem no
   RSC Payload. Verificar no layout da falsa sensacao de cobertura.
2. **O menu nao e barreira.** `navegacaoVisivel()` esconde itens sem permissao.
   Isso e cortesia de interface. Quem digita a rota, chama a server action
   direto ou monta um POST a mao nunca passa pelo menu.

O Gate 5 vai criar dezenas de rotas e casos de uso financeiros. A decisao
precisa existir antes deles, nao depois.

## Decisao

**Uma unica guarda, `exigirAcesso()`, em `nucleo/empresas/interface/guarda-acesso.ts`,
e o unico jeito de entrar em qualquer tela, server action ou rota de API do produto.**

```ts
const { contexto } = await exigirAcesso("contas_pagar.visualizar");
const pagina = await repositorio.listar(contexto, filtro, paginacao);
```

Ela executa a cadeia inteira, no servidor, a cada requisicao:

```
requisicao -> sessao valida -> empresa ativa valida -> vinculo ativo
           -> permissao exigida -> caso de uso
```

Tres decisoes possiveis, e nada mais:

| Situacao | Resposta |
|---|---|
| Sem sessao | redireciona para `/entrar?retorno=<rota>` |
| Com sessao, sem empresa acessivel (inclusive vinculo revogado) | redireciona para `/primeiro-acesso` |
| Com sessao e empresa, sem a permissao | `forbidden()` — **403**, renderizado por `app/forbidden.tsx`, e registrado no log |

Pontos que sustentam a decisao:

1. **A regra e pura e testada.** `decidirAcesso(acesso, exigidas, rota)` nao
   conhece Next.js nem banco: recebe o estado e as permissoes efetivas e
   devolve `permitir | redirecionar | proibir`. `exigirAcesso` e so o adaptador
   que traduz isso em `redirect()` / `forbidden()`. Mesmo padrao ja usado em
   `decidirDestino` (ADR-025).
2. **Verificacao junto do dado, nunca no layout.** Cada pagina e cada caso de
   uso chama a guarda. O layout de `(aplicacao)` continua resolvendo sessao e
   empresa para desenhar a casca, mas nao e tratado como controle de acesso.
3. **Nao existe sistema paralelo.** A guarda delega para `possuiAlguma` da
   ADR-007 e para `resolverContextoAplicacao` da ADR-025. Ela nao tem catalogo
   de permissoes proprio nem cache de sessao.
4. **Negar em caso de duvida.** Estado inesperado (por exemplo `pronto` sem
   permissoes resolvidas) cai em redirecionamento, nunca em acesso concedido.
5. **Uma lista significa "basta uma".** Para telas abertas a mais de um perfil.
   Quando forem necessarias TODAS, o caso de uso usa `possuiTodas` da ADR-007.

## `forbidden()` e o sinalizador experimental

`forbidden()` exige `experimental.authInterrupts: true` no `next.config.ts`.
Aceitamos essa dependencia porque ele entrega, com uma linha, o que as
alternativas nao entregam juntas: **status 403 de verdade** (redirecionar
mentiria com 307; lancar erro viraria 500), **tela dedicada** (`app/forbidden.tsx`)
e **funciona nos tres lugares** onde a guarda e usada — Server Components,
Server Actions e Route Handlers.

Se a API mudar ou sair, o impacto e pequeno e local: `decidirAcesso` continua
igual e so o ramo `proibir` de `exigirAcesso` troca de implementacao. **A
negacao nao depende do sinalizador** — sem ele perderiamos a pagina bonita, nao
o controle.

## Alternativas consideradas

| Opcao | Por que nao |
|---|---|
| Verificar no layout de `(aplicacao)` | Layout nao re-renderiza na navegacao e nao impede os segmentos de renderizar; falsa cobertura |
| Verificar no `proxy.ts` (middleware) | Contraria a ADR-025: o proxy nao le sessao nem banco de proposito. Mapear rota -> permissao em texto duplicaria o catalogo |
| `exigirPermissao` solta em cada rota | Funciona, mas e opcional por natureza: esquecer nao quebra nada visivel. Era exatamente o risco a eliminar |
| Redirecionar em vez de 403 | Esconde o motivo: o usuario volta ao inicio sem saber por que. E mente sobre o status HTTP |
| Lancar erro de dominio sem tratar | Vira 500; em producao a mensagem e sanitizada e a tela fica sem explicacao |

## Consequencias

**Positivas**

- Uma linha no topo de cada tela/acao cobre a cadeia inteira.
- Revisao fica simples: rota financeira sem `exigirAcesso` salta aos olhos.
- Acesso negado vira registro de log com usuario, empresa, rota e permissao.
- A regra e testavel sem subir servidor nem banco.

**Negativas**

- Depende de um sinalizador experimental do Next.js para a tela de 403.
- A guarda precisa ser chamada; nada no compilador obriga. Mitigacao: revisao,
  e a convencao de que toda pagina de `(aplicacao)` comeca por ela.

## Testes que sustentam esta ADR

`src/nucleo/empresas/interface/guarda-acesso.teste.ts`:

- usuario com a permissao e aceito;
- usuario autenticado e com empresa, mas sem a permissao, e proibido;
- `permissoes_removidas` no vinculo derruba o acesso mesmo com o papel certo;
- `permissoes_extras` concede sem trocar o papel;
- visitante e redirecionado guardando a rota pedida;
- vinculo revogado cai em "sem empresa" e volta ao primeiro acesso;
- **ver o item no menu nao autoriza a acao por tras dele** (`somente_leitura`
  enxerga `/contas-pagar` e mesmo assim e proibido de `contas_pagar.pagar`);
- menu adulterado nao muda a decisao do servidor;
- auditor le e nao movimenta dinheiro; `somente_leitura` nao cria nem edita.
