# ADR-025 — Contexto organizacional autenticado e empresa ativa

**Status:** Aceita · 2026-09-18 · Complementa a ADR-005 (multiempresa) e a ADR-007 (autorizacao)

## Contexto

Todo dado financeiro pertence a uma empresa, e a mesma instalacao serve varias
(escritorio de BPO, grupo economico). Antes dos modulos financeiros existirem,
e preciso decidir **de onde vem a resposta a "qual empresa?"** em cada
requisicao — e garantir que o navegador nao possa forja-la. Tambem e preciso
um caminho para a instalacao nascer: sem usuario nao ha quem crie empresa, e
sem empresa nao ha onde trabalhar.

## Decisao

1. **Cadeia de confianca resolvida no servidor, a cada requisicao.**
   `resolverContextoAplicacao()` (`nucleo/empresas/interface/`) le a sessao
   (Better Auth), consulta os vinculos ativos do usuario no banco
   (`listarEmpresasAcessiveis`), escolhe a empresa ativa e monta o
   `ContextoUsuario` da ADR-007 (ids + papel + permissoes efetivas). Os casos
   de uso continuam recebendo apenas `ContextoUsuario`.

2. **Cookie de empresa ativa e preferencia, nunca prova.**
   `financeiro.empresa-ativa` guarda o id escolhido; ele so vale se estiver na
   lista de acessiveis lida do banco naquela requisicao. Trocar de empresa
   valida antes de gravar. Sem cookie valido: uma unica empresa vira ativa;
   varias, a primeira em ordem alfabetica (o usuario troca no cabecalho).
   Nao ha tela de escolha obrigatoria.

3. **Instalador da primeira empresa e um caso de uso atomico.**
   `instalarPrimeiraEmpresa` cria organizacao + empresa + vinculo com papel
   `administrador` + evento de auditoria em uma transacao, sob
   `pg_advisory_xact_lock` chaveado pelo usuario (pedidos simultaneos ficam em
   fila; o segundo encontra o vinculo e desiste). O formulario pede apenas
   nome, nome fantasia e CNPJ opcional.

4. **Primeiro usuario por cadastro publico; depois, convite.**
   O cadastro (`/criar-conta`) fica aberto enquanto a instalacao nao tem
   usuario, em qualquer ambiente. Com usuarios, em producao, e recusado pelo
   proprio Better Auth (`databaseHooks.user.create.before`). Substitui o
   `disableSignUp: producao` da ADR-006, que impedia uma instalacao de
   producao de comecar.

5. **Rotas por estado, em uma tabela pura e testada.**
   `decidirDestino(estado, rota)`: visitante → `/entrar` (com `retorno` seguro);
   sem empresa → `/primeiro-acesso`; pronto → `/inicio`. `/` so redireciona.
   O Inicio passa a viver em `/inicio` (a ADR-021 e o mapa de telas foram
   ajustados).

6. **Modelo:** `vinculos_usuario.papel` vira o enum `papel_vinculo` (mesma
   lista de `PAPEIS`, com teste de igualdade) e a unicidade
   `(usuario, organizacao, empresa)` passa a `NULLS NOT DISTINCT`, fechando a
   brecha de dois vinculos "toda a organizacao" para o mesmo usuario.

## Alternativas consideradas

| Alternativa | Por que foi rejeitada |
|---|---|
| Empresa ativa na URL (`/empresas/[id]/...`) | Toda rota e todo link carregariam o id; o erro "lancar na empresa errada" ficaria mais facil, nao mais dificil. A validacao seria a mesma; o custo de interface, maior |
| Empresa ativa na sessao do Better Auth (campo extra) | Mistura identidade com preferencia; revogar um vinculo exigiria mexer na sessao. O cookie proprio + revalidacao e mais simples e igualmente seguro |
| Tela obrigatoria de escolha para quem tem N empresas | Um clique a mais por dia para o BPO; a troca no cabecalho resolve. Pode ser adicionada depois sem mudar a regra |
| Middleware/proxy decidindo acesso por cookie | Cookie de sessao presente nao prova sessao valida nem vinculo; a decisao precisa do banco. O proxy so repassa a rota pedida |
| Verificar "ja tem empresa" apenas na tela | Duas abas ou dois cliques criariam duas empresas. A verificacao e no caso de uso, sob lock |

## Consequencias

- Positivas: um unico lugar responde "quem e em qual empresa"; modulos
  futuros recebem `ContextoUsuario` pronto e nunca leem cookie ou parametro
  de empresa; isolamento coberto por testes unitarios (fake) e de integracao
  (PostgreSQL).
- Negativas: cada requisicao da aplicacao faz duas consultas (sessao +
  vinculos). Aceito: sao consultas por indice, e a ADR-006 ja abriu mao de
  cache de sessao pela revogacao imediata.
- O usuario que perde **todos** os vinculos volta ao estado "sem empresa" e
  pode instalar uma nova. Se isso for indesejado em algum cliente, o gate de
  usuarios introduz a distincao "revogado" x "nunca teve".

## Criterios para revisao

Revisar se surgir exigencia de "filial ativa" (hoje so empresa) ou de
consolidacao por organizacao na interface.
