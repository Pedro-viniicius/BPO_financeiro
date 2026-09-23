# Implantação na Nova Didata — passo a passo

> Gate 9. Este é o roteiro que será seguido na implantação real. Ele foi
> **ensaiado num banco vazio**, do zero, só pela interface — o registro do
> ensaio está no fim.

## Antes de começar: o que pedir à Nova Didata

Peça tudo de uma vez, porque cada item que falta trava um passo do meio.

| O que | Para quê | Formato |
|---|---|---|
| **Data em que vão começar a usar o sistema** | É a *data de corte*. Separa o que veio de antes do que nasce aqui — todo o resto depende dela. | uma data |
| Razão social, CNPJ, endereço, telefone, e-mail | Identificação da empresa | texto |
| **Saldo de cada conta bancária NA data de corte** | É dele que o sistema parte. Tem de ser o saldo do extrato naquele dia, não o de hoje. | extrato ou print |
| Lista de pessoas que vão usar o sistema | Cada uma recebe um convite | nome, e-mail e o que cada uma faz |
| Clientes e fornecedores | Cadastro | planilha modelo (baixe no sistema) |
| **Contas a pagar e a receber em aberto na data de corte** | A situação inicial | planilha modelo |
| Empréstimos e financiamentos em andamento | Saldo devedor e parcelas que faltam | contrato ou carnê |
| Logomarca | Identidade nas telas | PNG ou SVG |

Sobre as planilhas: **não peça que montem do zero.** Mande os modelos que o
próprio sistema gera (`Configurações → Implantação`), que já vêm com os
cabeçalhos certos, uma linha de exemplo e uma aba explicando cada coluna.

## O passo a passo

Cada passo tem uma tela. `Configurações → Implantação` mostra o que já está
pronto e o que falta, e **não obriga a seguir a ordem** — implantação real é
feita aos pedaços, esperando uma informação do cliente.

### 1. Criar o primeiro acesso

A primeira pessoa a entrar cria a conta e a empresa (tela de primeiro acesso).
Ela nasce administradora.

### 2. Dados da empresa e data de corte

`Configurações → Dados da empresa`. O CNPJ é conferido pelos dígitos
verificadores. **A data de corte não pode estar no futuro.**

### 3. Plano de contas

`Cadastros → Plano de contas → Usar o plano padrão`. Ele cobre todas as linhas
do demonstrativo e pode ser ajustado depois: renomear, inativar, acrescentar.
Apertar duas vezes não duplica nada.

Se a Nova Didata já tiver um plano próprio, crie as contas dela e **não** use o
padrão — ou use e ajuste, o que for menos trabalho.

### 4. Usuários

`Configurações → Usuários`. Cada pessoa recebe um **link de convite** válido por
48 horas, de uso único, e define a própria senha. O sistema nunca mostra nem
envia senha.

Enquanto o SMTP não estiver configurado, o link aparece na tela para você
repassar pelo canal que quiser (WhatsApp, e-mail próprio).

**Crie ao menos dois administradores.** Com um só, se essa pessoa perder o
acesso, ninguém mais consegue conceder permissão — e a saída passa a ser mexer
no banco de dados.

### 5. Contas bancárias

`Bancos e caixa`. Para cada conta, informe o **saldo na data de corte**. É o
número que aparece no extrato naquele dia.

### 6. Clientes e fornecedores

`Configurações → Implantação → Clientes e fornecedores`. Baixe o modelo,
preencha, envie. O sistema confere linha a linha **antes** de gravar e, se
qualquer linha tiver erro, não grava nada — mostra linha, coluna e motivo.

O CPF/CNPJ é o que faz o sistema reconhecer quem já está cadastrado, em vez de
duplicar. Peça-o sempre que possível.

### 7. Contas a pagar e a receber em aberto

`Configurações → Implantação → Contas em aberto`. **Uma linha por parcela em
aberto.** Só entram contas que vencem até a data de corte; o que vence depois é
lançado pela tela, no dia a dia.

Se uma parcela já teve pagamento parcial antes do corte, informe o valor
original e quanto já foi pago: entra o **saldo**, e o original fica registrado
nas observações.

### 8. Dívidas em andamento

`Dívidas → Registrar dívida`. Informe o valor **que ainda falta** e as parcelas
restantes — e confira a prévia contra o carnê do banco antes de salvar, porque
cada parcela vira uma conta a pagar.

### 9. Conferir antes de liberar

- `Bancos` — os saldos batem com os extratos na data de corte?
- `Contas a pagar` e `Contas a receber` — os totais em aberto batem com o que o
  cliente informou?
- `Resultados` — os meses anteriores ao corte fazem sentido?
- `Configurações → Exportar dados` — **exporte uma vez** e guarde. É a
  fotografia do dia da implantação.

### 10. Só então, dar acesso ao cliente

## Se algo der errado numa importação

Enquanto **nada** do que entrou tiver sido usado (baixa, conciliação ou
edição), o lote pode ser desfeito inteiro em `Configurações → Implantação`,
com um motivo que fica registrado. Depois que uma conta importada recebe baixa,
desfazer apagaria um pagamento real — e a tela passa a explicar isso em vez de
oferecer o botão.

---

## Ensaio geral — executado em 2026-09-23

Banco criado do zero (migrações 0000 a 0009), **só pela interface, sem nenhum
comando SQL**. Duração: **9 minutos**, com as planilhas já prontas.

| Passo | Resultado |
|---|---|
| Primeiro acesso + empresa | Nova Didata criada, data de corte 31/12/2025 |
| Plano padrão | 11 contas e 26 categorias; **0 linhas do DRE sem categoria** |
| Convite do operador | Link de uso único; segunda visita ao mesmo link recusada |
| 2 contas bancárias | R$ 42.850,00 e R$ 1.200,00 em 31/12/2025 |
| Importação de 20 pessoas | 20 criadas, 0 erros |
| Importação de 50 contas | 30 a pagar e 20 a receber, 0 erros |
| 1 dívida (Price 12x) | R$ 24.000,00, 12 parcelas viraram contas a pagar |
| 1 baixa | R$ 2.241,65, parcela ficou "Paga" |
| 1 conciliação | Tarifa de R$ 38,90 conciliada; pendências de 2 para 1 |
| Resultados | Receita de R$ 11.692,00 em nov–dez/2025, com comparativo mensal |
| Exportação completa | 21,7 KB, 27 arquivos, SHA-256 do cabeçalho igual ao do arquivo |

**Conferência final:** as contagens de 15 conjuntos do pacote foram comparadas
com o banco, uma a uma. Todas batem. A única diferença é `auditoria.csv`, com
16 linhas contra 17 no banco — e a linha a mais é o registro **da própria
exportação**, gravado depois de os arquivos serem montados.

O saldo do fluxo de caixa fechou sozinho:
42.850,00 + 1.200,00 + 24.000,00 − 2.241,65 − 38,90 = **R$ 65.769,45**.

### O que o ensaio mostrou que precisa de atenção

1. **A importação funciona sem JavaScript.** O formulário de confirmação chega
   renderizado pelo servidor na resposta da conferência. Foi verificado com um
   cliente HTTP puro, sem navegador.
2. **O seletor de credor da dívida lista todas as pessoas**, inclusive alunos.
   Está correto — um credor pode ser qualquer pessoa, e o papel de fornecedor é
   criado junto —, mas numa escola convém escolher com atenção.
3. **A conciliação só casa lançamento da mesma conta bancária.** No ensaio, a
   baixa foi registrada numa conta e o extrato importado em outra, e o sistema
   corretamente não sugeriu o casamento.
