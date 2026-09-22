# Marca

Tudo o que identifica a empresa dona da instalacao. O resto do sistema nao
escreve nome, cor, raio ou sombra: le daqui.

| Arquivo | O que guarda |
|---|---|
| `identidade.ts` | Nome, nome curto, sigla, assinatura, descricao e as perguntas que dao titulo as telas. |
| `tema-nova-didata.css` | Cores, raio dos cantos, sombras e tipografia. Redefine os tokens de `../tokens/tokens.css`. |
| `logotipo.tsx` | `Logotipo`: simbolo em SVG inline + nome, com cores de tokens (acompanha a troca de tema). `LogotipoOficial`: a arte original de `public/marca/`, usada nas telas de entrada. |
| `indice.ts` | Ponto unico de entrada. |

## Como vestir o sistema com outra marca

1. Copie `tema-nova-didata.css` para `tema-<nome-da-marca>.css` e troque os
   valores. Nenhum componente precisa ser tocado.
2. Troque o `@import` em `../estilos/global.css` para o novo arquivo.
3. Ajuste `identidade.ts` (nome, sigla, assinatura, `arquivoDeTema`).
4. Se o vocabulario do menu mudar, ajuste `../casca/mapa-navegacao.ts`.

`marca.teste.tsx` falha se alguem voltar a fixar o nome da marca dentro de um
componente — que e exatamente o que impediria a troca.

## Regras

- O tema so redefine tokens ja existentes; ele nao inventa nome de variavel
  que os componentes nao conhecem.
- `tokens.css` continua com um valor neutro para cada token da marca, para que
  o sistema abra mesmo sem tema.
- Contraste minimo AA e responsabilidade do tema: ao trocar as cores, confira
  `docs/ux/acessibilidade.md`.
- A marca tem TRES papeis de cor, porque nem toda marca serve de fundo para
  texto: `--cor-marca-forte` (identidade), `--cor-marca-acao` (fundo de botao
  primario, precisa passar AA com `--cor-marca-contraste`) e
  `--cor-marca-texto` (links sobre fundo claro, precisa passar AA). Em marcas
  escuras os tres podem ter o mesmo valor; em marcas claras e saturadas, nao.
- Cor da marca nunca substitui cor semantica: verde e sucesso, vermelho e
  risco, amarelo e atencao. A marca e identidade e acao primaria.
