# interface/

Sistema de design e casca da aplicacao (Gate 4). Documentacao em
[`docs/ux/`](../../docs/ux/LEIA-ME.md); decisoes em ADR-020 a ADR-024.

| Pasta | Conteudo | Pode importar |
|---|---|---|
| `tokens/` | `tokens.css` (unica fonte de valores visuais) e `pontos-de-quebra.ts` | nada |
| `estilos/` | `global.css`: reset, foco, utilitarios (`.numero-tabular`, `.apenas-leitor-de-tela`, `.pular-para-conteudo`) | `tokens/` |
| `formatacao/` | valor → texto: `formatarDinheiro`, `formatarData`, `formatarPercentual` | `compartilhado/` |
| `componentes/` | 17 componentes, um por pasta (`nome/nome.tsx` + `nome.module.css`), exportados por `indice.ts` | `tokens/`, `formatacao/`, `compartilhado/` |
| `casca/` | `CascaAplicacao` (cabecalho + barra lateral + conteudo), `mapa-navegacao.ts`, `BarraInferior` (celular) | `componentes/`, `tokens/`, tipos do `nucleo/autorizacao/publico` |

## Regras

1. **Nenhum valor visual literal** fora de `tokens.css`
   ([`docs/ux/design-tokens.md`](../../docs/ux/design-tokens.md)).
2. **Componentes recebem dados prontos** — `Dinheiro` em texto canonico,
   situacao ja decidida, tom semantico ja escolhido. Nada aqui calcula,
   compara datas ou decide regra financeira (ADR-024). Quem faz isso e o caso
   de uso; quem mapeia para *props* e `src/app/`.
3. **Nenhuma importacao de `modulos/`, `banco-dados/` ou internos do
   `nucleo/`.** A unica excecao e o tipo `Permissao` (via `publico.ts`) usado
   pelo mapa de navegacao. Verificado por `pnpm verificar:arquitetura`.
4. **Cor nunca sozinha**: todo uso de familia semantica vem com texto ou
   simbolo ([`docs/ux/acessibilidade.md`](../../docs/ux/acessibilidade.md)).
5. **Elementos nativos primeiro**: `<dialog>`, `<fieldset>`, `<table>`;
   `"use client"` so onde ha estado ou eventos.
6. Um componente novo entra em `componentes/indice.ts` e no documento de
   padrao correspondente (tabelas, formularios ou estados). Um padrao visual
   novo so nasce quando nenhum existente resolve (principio 15).

## Componentes

| Componente | Padrao (docs/ux) |
|---|---|
| `Botao`, `Aviso`, `SeloSituacao`, `ValorFinanceiro`, `Esqueleto` | estados-interface, design-tokens |
| `CabecalhoPagina`, `CartaoResumo` | navegacao, dashboard |
| `TabelaDados`, `BarraFiltros`, `EstadoVazio` | tabelas-e-listagens |
| `CampoFormulario`, `CampoDinheiro`, `SecaoFormulario`, `SeletorEntidade` | formularios |
| `Gaveta`, `DialogoConfirmacao` | navegacao (ADR-022), estados-interface |
| `LinhaDoTempo` | mapa-telas (detalhe de titulo) |

## Como a casca e usada

```tsx
// src/app/(aplicacao)/layout.tsx
<CascaAplicacao cabecalho={{ nomeDaEmpresa, nomeDoUsuario, papelDoUsuario }} grupos={navegacaoVisivel(permissoes)}>
  {children}
</CascaAplicacao>
```

A casca nao le sessao nem banco: `app/` monta o contexto e entrega pronto.
