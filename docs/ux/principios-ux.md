# Principios de UX

> Gate 4 — UX, Arquitetura de Informacao e Sistema de Interface · Documento 2

Este documento define **como decidimos** questoes de interface. Quando duas
solucoes parecerem igualmente boas, vence a que respeita mais principios desta
lista. Quando um principio for violado de proposito, a violacao e registrada em
uma ADR (`docs/decisoes/`).

> Convencao dos documentos deste gate: a prosa segue o padrao tecnico dos
> Gates 2 e 3 (portugues sem acento). **Todo texto entre aspas ou em `codigo`
> que representa copia de interface aparece exatamente como o usuario le**, com
> acentuacao correta — porque o produto e em portugues do Brasil.

---

## 1. O usuario enxerga o trabalho dele, nao as tabelas

A navegacao, os nomes das telas e os agrupamentos representam **tarefas
humanas**. `itens_extrato_bancario`, `parcelas_pagar` e `sequencias_codigo` sao
detalhes do Gate 3 e nao aparecem como itens de menu.

Teste pratico: se um item de menu so faz sentido para quem leu o modelo de
dados, ele esta errado.

## 2. Reconhecimento em vez de memorizacao

O usuario nao deve precisar lembrar:

- onde fica uma funcao — ela esta no contexto da tarefa;
- o que um termo significa — ha explicacao de uma linha ao lado;
- o que ele ja fez — o sistema mostra o historico;
- qual filtro estava aplicado — os filtros ativos ficam visiveis como fichas.

## 3. A pergunta antes do numero

Cada bloco de informacao responde a uma pergunta que o usuario realmente faz.
O titulo do bloco e a pergunta ou a resposta, nunca o nome do calculo.

| Em vez de | Escrevemos |
|---|---|
| "Saldo consolidado" | "Disponivel hoje" |
| "Titulos em aberto vencidos" | "Vencido — precisa de acao" |
| "Aging de recebiveis" | "Ha quanto tempo estao devendo" |
| "Variacao orcamentaria" | "Gastou mais do que planejou?" |

Precisao financeira nao e sacrificada: o termo tecnico aparece como subtitulo
ou na explicacao ("Saldo consolidado das contas ativas").

## 4. Progressive disclosure: o essencial primeiro

Uma conta a pagar mostra, na lista: fornecedor, descricao, vencimento, valor,
situacao. Categoria, centro de custo, aprovador, anexos, recorrencia, historico
e dados tecnicos aparecem quando o usuario abre o registro — e mesmo la, em
secoes que podem comecar recolhidas.

Detalhe: nunca escondemos um **campo obrigatorio** atras de progressive
disclosure. Esconder o obrigatorio produz erro de validacao sem causa visivel.

## 5. Prevenir e melhor do que corrigir; corrigir e melhor do que proibir

Ordem de preferencia para evitar um erro financeiro:

1. **Impedir** que o estado invalido seja representavel (o banco ja faz isso —
   Gate 3; a interface nao oferece o caminho).
2. **Avisar antes**: duplicidade provavel, valor muito acima da media,
   vencimento em fim de semana.
3. **Confirmar com resumo** antes de acao de impacto.
4. **Permitir desfazer/estornar** depois, deixando rastro.

Bloquear o usuario e o ultimo recurso, e sempre com explicacao do motivo.

## 6. Velocidade para quem repete

Rafael lanca dezenas de contas por dia. Para ele:

- toda tela de lista tem acao primaria alcancavel por teclado;
- formularios de lancamento tem "Salvar e criar outra";
- campos tem valores padrao seguros (data de hoje, ultima conta usada,
  categoria mais usada com aquele fornecedor);
- nenhuma confirmacao extra em operacao reversivel e de baixo impacto.

Velocidade nunca vem de esconder informacao necessaria a conferencia.

## 7. Cor nunca e a unica portadora de significado

Toda situacao financeira e comunicada por **texto + forma/icone**, com cor como
reforco. "Vencido" e escrito, nao apenas vermelho. Ver
[`acessibilidade.md`](acessibilidade.md).

## 8. Numeros comparaveis

Valores monetarios usam algarismos de largura fixa (*tabular numbers*),
alinhados a direita, com o mesmo numero de casas. Comparar duas linhas deve ser
um movimento de olho, nao um calculo.

## 9. O sistema diz o que aconteceu e o que fazer

Nenhuma mensagem "Ocorreu um erro". Toda mensagem responde: **o que aconteceu,
por que, o que fazer agora**. Ver [`estados-interface.md`](estados-interface.md).

## 10. Nada desaparece sem rastro

O dominio cancela e estorna; nao apaga (Gate 3). A interface usa o mesmo
vocabulario: o botao diz "Estornar pagamento", nao "Excluir". O que foi
estornado continua visivel, marcado.

## 11. A interface nao decide regra financeira

A interface **apresenta** estados e valores que vieram do dominio. Ela nao
calcula saldo, nao decide se um titulo esta vencido, nao arredonda dinheiro e
nao aplica juros. Isso e regra verificada por
`pnpm verificar:arquitetura` (ver [ADR-024](../decisoes/ADR-024-camada-apresentacao.md)).

## 12. Estabilidade visual

O layout nao "pula". Carregamento usa esqueleto (*skeleton*) do tamanho do
conteudo final; troca de filtro atualiza apenas a regiao afetada; a altura do
cabecalho e da barra lateral nao muda.

## 13. Densidade a servico da tarefa

Nem tudo e tabela densa, nem tudo e cartao grande:

| Quando | Formato |
|---|---|
| Comparar muitas linhas por varios campos | Tabela |
| Reconhecer poucos itens heterogeneos | Cartoes |
| Decidir com base em um total e depois conferir | Resumo + tabela |
| Comparar dois lados (extrato x sistema) | Duas colunas pareadas |

## 14. Desktop primeiro, sem abandonar o celular

O trabalho financeiro denso acontece em desktop (ver
[`responsividade.md`](responsividade.md)). O celular atende consulta e
aprovacao — as tarefas de Marcia e Beto — e nao tenta reproduzir a tela de
conciliacao.

## 15. Consistencia e mais valiosa do que criatividade

Duas telas com o mesmo problema usam a mesma solucao. Um novo padrao visual so
nasce quando nenhum existente resolve, e entra no sistema de design (nao no
componente).

---

## Anti-principios (o que recusamos)

| Recusamos | Porque |
|---|---|
| Menu com um item por tabela | Expoe o banco, nao a tarefa (Principio 1) |
| Dashboard com 20 indicadores | Nenhum e lido; o Gate 1 limita a 6 perguntas e 4 graficos |
| Modal sobre modal | Perde contexto e trava o teclado |
| Texto cinza-claro sobre branco para dado financeiro | Contraste insuficiente |
| Icone sozinho como acao destrutiva | Ambiguo; acao de impacto tem rotulo |
| "Excluir" para operacao que o dominio estorna | Mente sobre o efeito (Principio 10) |
| Tooltip como unico lugar de informacao essencial | Inacessivel por teclado e no celular |
| Rolagem infinita em lista financeira | Impede conferencia e totalizacao |
