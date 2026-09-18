# compartilhado/

Conceitos pequenos e estaveis usados por todos os modulos. Nao contem regras
de negocio de nenhum modulo especifico e **nao importa nada** de `modulos/`,
`nucleo/` ou `integracoes/`.

| Pasta | Conteudo |
|---|---|
| `dinheiro/` | `Dinheiro` (valor em centavos, BigInt), `Percentual`, regras de arredondamento |
| `datas/` | `DataCivil` (dia sem hora/fuso) e os tipos nomeados de data financeira |
| `erros/` | `ErroDominio` (base), `Resultado`, erros comuns |
| `validacao/` | Esquemas Zod reutilizaveis, validacao de CPF/CNPJ |
| `tipos/` | Identificadores nominais, paginacao, `EscopoEmpresa` |

Importe sempre pelo arquivo `indice.ts` de cada pasta.
