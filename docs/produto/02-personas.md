# Personas

> Gate 1 — Produto e Domínio · Documento 2 de 6

As personas abaixo são arquétipos, não pessoas reais. Elas orientam decisões
de interface, vocabulário, permissões e priorização. Quando duas
funcionalidades competem por prioridade, vence a que atende melhor a
**Márcia** e **Rafael** — as personas primárias.

## Resumo

| Persona | Papel | Frequência de uso | Dispositivo principal | Papel no sistema |
|---|---|---|---|---|
| Márcia | Dona de pequena empresa | Diária (rápida) | Desktop + celular | Administrador |
| Rafael | Auxiliar administrativo | Diária (intensa) | Desktop | Financeiro |
| Juliana | Sócia-gestora de empresa média | Semanal / mensal | Desktop | Gestor |
| Carlos | Operador de BPO financeiro / contador externo | Diária, várias empresas | Desktop | Financeiro ou Consulta (por empresa) |
| Beto | Sócio aprovador | Ocasional | Celular | Gestor (aprova) |

---

## Persona 1 — Márcia, a dona que precisa saber (primária)

**Perfil.** 47 anos, dona de uma pequena indústria de alimentos com 14
funcionários. Faturamento em torno de R$ 180 mil/mês. Não tem formação em
finanças. Usava um software de gestão antigo, cujo suporte foi encerrado, e
hoje mantém uma planilha "de verdade" no computador do escritório e outra
"de bolso" no celular. O contador externo cuida da parte fiscal e ela nunca
entende o balancete que recebe.

**O que ela quer.**
- Saber, todo dia de manhã, **quanto tem, quanto entra e quanto sai**.
- Saber **se vai faltar dinheiro** antes que falte.
- Entender **se a empresa está dando lucro de verdade**, não só se "sobrou
  dinheiro no banco".
- Não depender de uma única funcionária para "mexer no sistema".
- Pagar uma vez e ter o sistema como seu, sem mensalidade obrigatória.

**O que ela não quer.**
- Aprender vocabulário contábil.
- Telas com 40 campos.
- Assinar algo que pode ser descontinuado de novo.

**Frases típicas.**
- "Eu só quero saber se dá pra pagar o décimo terceiro."
- "Por que o banco diz que tenho 30 mil e a planilha diz 42?"
- "Esse mês vendemos mais, mas parece que sobrou menos. Por quê?"

**Implicações de design.**
- A tela **Hoje** e o dashboard são feitos para ela.
- Cada indicador tem explicação em uma frase, sem fórmula obrigatória.
- Alertas em linguagem direta: "Falta de caixa prevista no dia 23".
- Análises de IA acessíveis, mas fora do caminho principal.

---

## Persona 2 — Rafael, o operador do dia a dia (primária)

**Perfil.** 29 anos, auxiliar administrativo. Cuida de contas a pagar, contas
a receber, emissão de cobranças e conferência do extrato. Tem formação técnica
em administração, mas não é contador. Registra dezenas de lançamentos por dia
e é ele quem sofre com sistemas lentos e repetitivos.

**O que ele quer.**
- Lançar uma conta em poucos segundos, com teclado, sem sair da tela.
- Recorrência e parcelamento automáticos ("aluguel todo dia 5", "12x").
- Importar o extrato e conciliar sem precisar comparar linha por linha.
- Saber com clareza o que já foi conferido e o que falta.
- Poder corrigir um erro sem medo e sem "quebrar" o mês.

**O que ele não quer.**
- Digitar o mesmo fornecedor três vezes.
- Confirmação em duas etapas para cada clique.
- Descobrir depois que lançou a mesma conta duas vezes.

**Frases típicas.**
- "Deixa eu lançar rápido que tem mais cinquenta."
- "Esse lançamento já está no sistema?"
- "Eu marquei como pago, mas o banco ainda não mostra."

**Implicações de design.**
- Formulário rápido de lançamento com atalhos de teclado e autocompletar.
- Detecção de duplicidade no momento do registro.
- Fila de conciliação com indicadores de confiança e ações em lote com
  pré-visualização.
- Desfazer e lixeira.

---

## Persona 3 — Juliana, a gestora que quer performance (secundária)

**Perfil.** 38 anos, sócia de uma empresa de serviços com 45 pessoas e
faturamento de R$ 900 mil/mês. Tem alguma familiaridade com finanças. Quer
orçamento, DRE gerencial e margens. Cansou de montar isso em planilha todo mês.

**O que ela quer.**
- DRE gerencial mensal com estrutura que ela possa ajustar.
- Orçamento por categoria e centro de custo, com comparação orçado × realizado.
- Margens ao longo do tempo.
- Cenários: "e se as vendas caírem 10%?".
- Segregação de funções: quem lança não é quem aprova.

**Implicações de design.**
- Módulo de Controle Gerencial com personalização da estrutura da DRE.
- Orçado × realizado com explicação de variação favorável/desfavorável.
- Fluxo de aprovação configurável.
- Assistente Financeiro com cenários e premissas expostas.

---

## Persona 4 — Carlos, o operador de BPO financeiro (secundária)

**Perfil.** 41 anos, sócio de um escritório de BPO financeiro que atende 22
empresas pequenas. Sua equipe faz o lançamento, a conciliação e o fechamento
mensal de cada cliente. Precisa alternar entre empresas várias vezes por dia
sem risco de lançar na empresa errada.

**O que ele quer.**
- Um único login com acesso a várias empresas, com **troca de contexto
  explícita e inconfundível**.
- Padrões reaproveitáveis (categorias, estrutura de DRE) entre clientes.
- Relatórios que ele possa entregar ao cliente sem retrabalho.
- Trilha de auditoria para provar o que foi feito e quando.

**Implicações de design.**
- Um usuário pode ter vínculos com várias organizações, com papel por
  organização.
- A organização ativa é sempre visível e a troca exige ação deliberada.
- Isolamento de dados por organização garantido no servidor.
- Exportação de relatórios.

> Nota: o BPO é uma persona secundária no MVP, mas influencia decisões
> estruturais (multi-organização, isolamento, papéis por organização). Essas
> decisões precisam estar corretas desde o início porque são caras de corrigir
> depois.

---

## Persona 5 — Beto, o sócio que aprova pelo celular (terciária)

**Perfil.** 52 anos, sócio de Márcia. Não opera o sistema. Recebe uma
notificação, abre no celular, vê o pagamento pendente de aprovação, aprova ou
recusa com um comentário.

**Implicações de design.**
- Fluxo de aprovação otimizado para celular: pouca informação, ação clara.
- Notificações objetivas.
- Reautenticação para ações sensíveis.

---

## Anti-persona

**O analista financeiro de grande empresa.** Quer planilhas dinâmicas,
consolidação multiempresa, rateio complexo, contabilidade de custos avançada e
integração com ERP corporativo. Este produto **não é para ele** no MVP. Tentar
atendê-lo destruiria a simplicidade que atende Márcia e Rafael.
