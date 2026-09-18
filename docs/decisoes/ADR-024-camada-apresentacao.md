# ADR-024 — Camada de apresentacao: a interface nao decide regra financeira

**Status:** Aceita · 2026-09-18 · Complementa a ADR-014

## Contexto

E tentador calcular um saldo no componente, decidir "vencido" comparando datas
no React ou arredondar um valor para exibir. Cada uma dessas decisoes duplica
regra do dominio na interface e, com o tempo, as duas divergem — e o usuario
ve um numero na tela e outro no relatorio.

## Decisao

Tres camadas com responsabilidades fixas:

| Camada | Pasta | Responsabilidade | Proibido |
|---|---|---|---|
| **Sistema de design** | `src/interface/componentes/`, `tokens/`, `casca/` | Desenhar. Recebe dados prontos (`Dinheiro`, `DataCivil`, situacao ja decidida, tom semantico ja escolhido) | Importar modulos, nucleo interno, banco; calcular; decidir situacao |
| **Formatacao** | `src/interface/formatacao/` | Transformar valor em texto (`R$ 1.234,56`, `15/09/2026`) | Arredondar, somar, comparar |
| **Apresentacao** | `src/app/` (paginas, layouts, *server actions*) | Chamar casos de uso pelo `publico.ts`, mapear resultado para *props* dos componentes | Acessar `dominio/`, `aplicacao/`, `infraestrutura/`, banco |

Regras verificadas por `pnpm verificar:arquitetura`
(`.dependency-cruiser.cjs`): `app-nao-importa-infraestrutura`,
`modulos-importam-nucleo-so-pelo-publico` (inclui `app/`) e
`frameworks-so-em-camadas-tecnicas`. A camada de apresentacao e a unica que
conhece Next.js **e** o `publico.ts` dos modulos; o sistema de design nao
conhece nenhum dos dois lados.

Regras que o lint nao pega e a revisao cobra:

- `SeloSituacao` recebe `rotulo` e `tom`; quem decide que "vencida" e
  `perigo` e o caso de uso (ou um mapeamento em `app/`), nao o componente.
- `ValorFinanceiro` recebe o valor **canonico em texto** de `Dinheiro`
  (ADR-015); nunca `number`. A formatacao converte para `R$ 1.234,56` sem
  arredondar nem somar.
- Nenhum `new Date()` para decidir situacao em componente; "hoje" vem do caso
  de uso.

## Alternativas consideradas

- **Componentes que chamam casos de uso diretamente** — acopla o sistema de
  design ao dominio; impossivel testar um componente sem banco.
- **Uma pasta `interface/` dentro de cada modulo** (como `infraestrutura/`) —
  considerada e mantida como possibilidade: telas especificas de um modulo
  podem viver em `modulos/<x>/interface/` no Gate 6, desde que importem apenas
  o sistema de design e o `publico.ts`. Esta ADR nao proibe; apenas fixa o que
  cada camada pode saber.

## Consequencias

- Os componentes sao testaveis com dados de exemplo, sem Next.js nem banco.
- Um numero errado na tela tem um unico lugar para investigar: o caso de uso.
- Custo: `app/` escreve mapeamentos "resultado → props" que parecem
  repetitivos. Aceito; e o preco de manter a regra em um lugar so.
