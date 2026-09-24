# Estados da interface

> Gate 4 · Documento 10 — vazio, carregando, erro, sucesso, confirmacao,
> operacao demorada, cancelamento/estorno e historico.

Uma tela nao tem um estado: tem seis. O estado "tudo certo e cheio de dados" e
o menos frequente na vida de uma instalacao nova.

---

## 1. Estados vazios

Todo estado vazio responde tres coisas: **o que é isso**, **por que está
vazio**, **o que fazer agora**. Nunca uma caixa cinza escrita "Sem dados".

| Tela | Titulo | Explicacao | Acao |
|---|---|---|---|
| Inicio (instalacao nova) | `Vamos começar` | "Em 4 passos seu financeiro fica no ar." | `Cadastrar conta bancária` |
| Contas a pagar | `Nenhuma conta a pagar ainda` | "Aqui ficam os compromissos com fornecedores, impostos e serviços." | `Nova conta` · link "Importar de uma planilha" |
| Contas a receber | `Nenhuma conta a receber ainda` | "Aqui ficam as vendas e serviços que você tem a receber." | `Nova conta a receber` |
| Bancos e caixa | `Cadastre sua primeira conta` | "O saldo inicial que você informar é o ponto de partida do sistema." | `Nova conta` |
| Movimentacoes da conta | `Nenhuma movimentação` | "Movimentações aparecem quando você importa um extrato ou registra um pagamento." | `Importar extrato` |
| Extratos | `Nenhum extrato importado` | "Baixe o arquivo OFX no site do seu banco e traga para cá." | `Importar extrato` · link "Como baixar o OFX" |
| Conciliacao (sem pendencia) | `Tudo conciliado neste período` | "Cada linha do extrato tem um lançamento correspondente." | `Ver outro período` |
| Conciliacao (sem extrato) | `Nada a conciliar` | "Importe um extrato para comparar com os seus lançamentos." | `Importar extrato` |
| Clientes / Fornecedores | `Nenhum cliente cadastrado` | "Você também pode criar um cliente na hora de lançar uma conta." | `Novo cliente` · `Importar CSV` |
| Categorias | `Sem categorias` | "Categorias definem onde cada valor aparece no seu resultado." | `Usar modelo por segmento` |
| Cobranca | `Ninguém em atraso` | "Quando um recebimento passar do vencimento, ele aparece aqui." | — |
| Aprovacoes | `Nada aguardando aprovação` | — | — |
| Fluxo de caixa | `Ainda não há movimentações suficientes` | "Lance contas ou importe um extrato para ver o fluxo." | `Nova conta a pagar` |
| DRE | `Sem lançamentos no período` | "Escolha outro período ou lance suas primeiras contas." | `Trocar período` |
| Orcamento | `Nenhum orçamento para 2026` | "Comece a partir do que você realmente gastou nos últimos meses." | `Copiar do realizado` |
| Dividas | `Nenhuma dívida cadastrada` | "Empréstimos e financiamentos entram aqui com suas parcelas." | `Nova dívida` |
| Anexos (no registro) | `Nenhum documento anexado` | "Nota fiscal, boleto ou comprovante." | `Anexar` |
| Historico (no registro) | Nunca vazio | Sempre ha pelo menos "Criada por ... em ..." | — |
| Busca sem resultado | `Nada encontrado para "moinho"` | "Verifique a grafia ou busque pelo CNPJ." | `Limpar busca` |
| Filtro sem resultado | `Nenhuma conta com esses filtros` | Lista os filtros aplicados | `Limpar filtros` |
| Primeiro acesso de um usuario convidado | `Bem-vindo, Rafael` | "Você entrou como Financeiro na Padaria São Jorge." | `Ver o que preciso fazer hoje` |

Regra: estado vazio **por filtro** e diferente de estado vazio **de verdade**.
Oferecer `Nova conta` para quem filtrou errado e uma resposta idiota.

Regra: quando a tela depende de outro cadastro (nova conta sem fornecedor,
sem cliente ou sem categoria; dívida sem credor; orçamento sem categoria), a
acao diz o passo e leva ao formulario exato, nao a pagina inteira:
`Cadastrar cliente` abre `/cadastros?papel=cliente#cadastrar-pessoa`, com o
papel ja marcado; `Criar categoria` abre `/cadastros#nova-categoria`. Um
"Ir para Cadastros" deixava a pessoa procurando o formulario numa pagina
longa e esquecendo de marcar o papel, o que faz o cadastro ser recusado.

## 2. Carregamento

| Situacao | Padrao |
|---|---|
| Primeira carga da pagina | Esqueleto com a forma do conteudo final (mesma altura, mesmo numero de linhas) |
| Troca de filtro/pagina | Conteudo atual permanece, esmaecido (opacidade 0,6), com indicador discreto; **altura nao muda** |
| Bloco do painel | Esqueleto proprio; cada bloco carrega sozinho |
| Botao que dispara acao | Estado ocupado no proprio botao, com o rotulo trocado (`Salvando...`) e o botao inacessivel a novo clique |
| Gaveta/dialogo | Abre imediatamente com esqueleto; nunca espera os dados para abrir |
| Abaixo de 200 ms | Sem indicador nenhum — piscar e pior do que esperar |

Regra de ouro: **nada de** *spinner* **no meio da tela inteira**. Ele apaga o
contexto e faz o layout pular quando some.

## 3. Operacao demorada

Para importacao de extrato, exportacao grande, conciliacao em lote e
fechamento de mes:

1. Resposta imediata: "Importando 340 linhas..." com barra de progresso quando
   o total for conhecido.
2. Se passar de 5 s: "Isso pode levar alguns segundos. Você pode continuar
   usando o sistema — avisaremos quando terminar."
3. A operacao continua se a pessoa sair da tela; o aviso chega pelo sino.
4. Ao terminar: resumo com numeros (`312 importadas · 26 já existiam · 2 com
   erro`), nunca so "Concluído".
5. Falha no meio: diz **quantas** foram processadas e se e seguro repetir
   (importacao e idempotente por impressao digital — Gate 3 — e a mensagem diz
   isso: "Você pode importar novamente; nada será duplicado.").

## 4. Sucesso

| Tipo | Padrao |
|---|---|
| Acao pequena e reversivel | Aviso flutuante (4 s), discreto, com `Desfazer` quando existir |
| Acao que muda a tela | A propria tela e a confirmacao; o registro novo aparece destacado por 2 s |
| Acao com resultado a conferir | Resumo permanente na tela (importacao, lote), nao aviso que some |
| Acao critica (estorno, cancelamento) | Aviso persistente ate o usuario fechar, com link para o historico |

O aviso de sucesso diz **o que aconteceu com numero**:
"Pagamento de R$ 2.400,00 registrado na conta Bradesco." e util;
"Salvo com sucesso!" nao e.

## 5. Erro

Todo erro responde: **o que aconteceu · por que · o que fazer**.

| Tipo | Onde aparece | Exemplo |
|---|---|---|
| Validacao de campo | Abaixo do campo | "Informe o vencimento." |
| Regra de negocio | Topo do formulario/dialogo | "O valor pago (R$ 3.000,00) é maior que o saldo devedor da parcela (R$ 2.400,00). Ajuste o valor ou registre um pagamento parcial." |
| Permissao | No lugar da acao | "Você entrou como Consulta e não pode registrar pagamentos. Peça ao administrador da empresa." |
| Conflito de edicao | Faixa no topo do registro | "Esta conta foi alterada por Rafael às 14:32. Recarregue para ver a versão atual." |
| Falha de carregamento | No bloco afetado | "Não foi possível carregar o saldo. Tentar novamente" |
| Falha de rede ao salvar | Topo do formulario, dados preservados | "Sem conexão com o servidor. Seus dados continuam aqui; tente salvar de novo." |
| Erro inesperado | Pagina de erro da secao | "Algo quebrou nesta tela. O erro foi registrado com o código 7f3a. Voltar ao Início" |

Proibido: "Ocorreu um erro", "Erro 500", "Something went wrong", mensagem do
banco de dados crua, `constraint verifica_pagamentos_total violated`.

**Tradução obrigatoria** das violacoes do banco (Gate 3) para linguagem de
negocio — a tabela de correspondencia vive no codigo de interface junto ao
mapa de erros, e todo CHECK/UNIQUE novo precisa de uma frase antes de entrar.

| Restricao (Gate 3) | Mensagem ao usuario |
|---|---|
| `verifica_pagamentos_total` | "A soma de principal, juros, multa e desconto não bate com o valor pago." |
| `unico_itens_extrato_identificador` | "Esta linha do extrato já foi importada." |
| `unico_conciliacao_item_ativo` | "Esta linha do extrato já está conciliada." |
| `verifica_titulos_pagar_aprovador` | "Você criou esta conta. A aprovação precisa ser de outra pessoa." |
| `fk` de fornecedor/categoria | "O fornecedor selecionado não existe mais. Escolha outro." |

## 6. Confirmacao

Pedimos confirmacao **so** quando a acao e de impacto financeiro ou dificil de
reverter. Confirmacao em excesso treina o usuario a clicar `Sim` sem ler.

Estrutura de todo dialogo de confirmacao:

```text
Título: o verbo e o objeto        "Estornar pagamento?"
Resumo: o que exatamente acontece  Pagamento de R$ 2.400,00 em 15/09
                                   Conta Bradesco · Título CP-2026-000123
Impacto: o efeito no sistema       · A conta volta para "Em aberto"
                                   · O saldo do Bradesco aumenta R$ 2.400,00
                                   · A conciliação desta movimentação será desfeita
Campo:   quando exigido            Motivo do estorno (obrigatório)
Botões:  [Cancelar]  [Estornar pagamento]
```

O botao confirma com o **verbo da acao**, nunca `OK`/`Sim`. Acoes destrutivas
usam o estilo de perigo e ficam a direita, longe de `Cancelar`.

| Acao | Confirma? | Por que |
|---|---|---|
| Criar/editar conta a pagar | Nao | Reversivel, baixo impacto |
| Registrar pagamento | Nao (mas o dialogo ja mostra o total) | O proprio formulario e a conferencia |
| Registrar pagamento em lote | **Sim** | Muitos registros de uma vez |
| Estornar pagamento | **Sim** + motivo | Muda saldo e desfaz conciliacao |
| Cancelar titulo | **Sim** + motivo | Muda o resultado do periodo |
| Marcar recebimento como perda | **Sim** + motivo | Impacto no resultado |
| Desfazer conciliacao | **Sim** | Reabre trabalho ja conferido |
| Conciliar sugestao de confianca alta | Nao individualmente; **sim** em lote | Volume |
| Excluir anexo | **Sim** | Perde documento |
| Remover usuario | **Sim** | Acesso |
| Desativar cadastro com movimento | Nao (avisa o efeito) | Reversivel |

## 7. Atualizacao otimista

Usada **apenas** onde a falha e inofensiva e o estado e local:

| Permitido | Proibido |
|---|---|
| Marcar ponto de atencao como lido | Registrar pagamento |
| Ordenar/filtrar lista | Conciliar |
| Expandir/recolher secao | Aprovar |
| Favoritar/fixar | Estornar, cancelar |
| Reordenar colunas | Qualquer coisa que gere movimentacao |

Regra: se a acao gera lancamento, movimentacao ou muda saldo, a interface
**espera a confirmacao do servidor**. Mostrar dinheiro que ainda nao foi
gravado e mentir para o usuario.

## 8. Cancelamento e estorno (o dominio nao apaga)

O Gate 3 decidiu: o que virou historia nao se apaga — cancela-se, estorna-se,
desativa-se. A interface fala a mesma lingua.

| O usuario quer | Botao que existe | O que acontece | Vocabulario proibido |
|---|---|---|---|
| Desfazer um pagamento registrado | `Estornar pagamento` | Cria estorno; parcela volta a aberta; saldo volta | "Excluir pagamento" |
| Anular uma conta que nao existe mais | `Cancelar conta` | Situacao vira `cancelado`, com motivo; some das listas abertas, continua no historico | "Excluir conta" |
| Parar de usar um fornecedor | `Desativar fornecedor` | Some das buscas; registros antigos intactos | "Excluir fornecedor" |
| Desfazer uma conciliacao | `Desfazer conciliação` | Vinculo marcado inativo; os dois lados voltam a pendentes | "Remover conciliação" |
| Corrigir um erro recem-cometido | `Desfazer` (aviso de sucesso, alguns segundos) | Estorno automatico com motivo "Desfazer imediato" | — |

`Excluir` so existe onde o dominio realmente permite apagar: anexo, rascunho
sem efeito financeiro e cadastro **sem nenhum movimento**. Nesses casos o botao
diz `Excluir` e a confirmacao avisa que a acao e definitiva.

## 9. Historico (linha do tempo)

Toda entidade financeira importante tem uma secao `Histórico` com a linha do
tempo em **linguagem de negocio**:

```text
12/09 09:14  Conta criada por Rafael Lima            R$ 2.400,00
13/09 10:02  Aprovada por Beto Andrade
15/09 16:40  Pagamento registrado por Rafael Lima    R$ 800,00 · Bradesco
15/09 16:41  Documento anexado: comprovante.pdf
16/09 08:12  Conciliada com a linha do extrato de 15/09
18/09 11:30  Valor alterado por Rafael Lima          de R$ 2.400,00 para R$ 2.380,00
```

Regras:

- quem, quando, o que mudou — com valor anterior e novo quando fizer sentido;
- ordem cronologica crescente (a leitura e uma historia);
- **sem** identificador tecnico, sem nome de tabela, sem JSON;
- `Ver detalhes técnicos` so aparece para quem tem `auditoria.visualizar`;
- a linha do tempo nunca e editavel e nunca some — e a face visivel da
  auditoria *append-only* do Gate 3.

## 10. Notificacoes

| Canal | Uso |
|---|---|
| Aviso flutuante | Resultado imediato de acao do proprio usuario |
| Sino no cabecalho | Pontos de atencao, fim de operacao demorada, aprovacao pendente |
| Bloco `Precisa de atenção` no Inicio | O estado atual, sempre visivel |
| E-mail | Fase 2, e sempre opcional |

Nunca interrompemos o usuario com dialogo para dar noticia; dialogo e so para
decisao.
