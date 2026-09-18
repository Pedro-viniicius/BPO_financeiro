# Integracoes

> Gate 2 · ADR-011. Codigo em `src/integracoes/`.

## Ideia central: portas e adaptadores

- **Porta** (contrato): interface TypeScript que descreve o que o nucleo
  precisa ("me de as movimentacoes desta conta neste periodo").
- **Adaptador** (provedor): implementacao para um servico especifico
  (banco X, agregador Y, arquivo OFX).

O nucleo depende SO das portas. Cada adaptador e uma pasta em `provedores/`
e pode ser vendido/ativado separadamente.

```
integracoes/
  bancarias/
    contratos/provedor-bancario.ts   ProvedorBancario, ContaBancariaExterna, MovimentacaoBancariaExterna
    contratos/leitor-extrato.ts      LeitorExtrato (OFX, CSV, XLSX)
    provedores/                      (Gate 7: ofx/, csv/; Fase 2: open-finance-x/)
    publico.ts
  contabeis/
    contratos/exportador-contabil.ts ExportadorContabil
  email/
    contratos/enviador-email.ts      EnviadorEmail
    provedores/enviador-email-console.ts   (SMTP no Gate 5)
  webhooks/
    contratos/receptor-webhook.ts    ReceptorWebhook (validar assinatura, interpretar)
  inteligencia-artificial/           ver inteligencia-artificial.md
```

## Contratos existentes

| Porta | Metodos | Quem consome |
|---|---|---|
| `ProvedorBancario` | `obterContas`, `obterMovimentacoes(conta, periodo)`, `obterSaldo(conta)` | `bancos`, `conciliacao-bancaria` |
| `LeitorExtrato` | `ler(conteudo, opcoes) → ExtratoLido` | `importacao` |
| `ExportadorContabil` | `exportar(pedido) → arquivo` | `exportacao` |
| `EnviadorEmail` | `enviar(mensagem)` | `notificacoes`, autenticacao |
| `ReceptorWebhook` | `validarAssinatura`, `interpretar → tarefa` | rota de webhooks |
| `ProvedorInteligenciaArtificial` | `analisar(pergunta) → AnaliseFinanceira` | gateway de IA |

Todos produzem tipos do nosso dominio (`Dinheiro`, `DataMovimentacao`),
nunca os tipos crus do SDK.

## Onde o adaptador e escolhido

`src/composicao/` le configuracao (`.env`) e licenca (portao de recursos) e
monta o objeto certo:

```ts
// composicao/email.ts
EMAIL_PROVEDOR=console → EnviadorEmailConsole
EMAIL_PROVEDOR=smtp    → EnviadorEmailSmtp (Gate 5)
```

Regra de lint: so `composicao/` importa `provedores/`.

## Alinhamento comercial

| Integracao | Recurso no portao | Situacao |
|---|---|---|
| Leitura de OFX/CSV | `importacao_ofx`, `importacao_csv` (base 1.x) | Gate 7 |
| Open Finance / API bancaria | `integracao_bancaria` (contratada a parte) | Fase 2 |
| Exportacao contabil | `integracao_contabil` (contratada a parte) | Fase 2 |
| PIX/boleto | dentro de `faturamento` via `PaymentReferenceProvider` | Fase 2 |
| IA | `analises_ia` (contratada a parte; consumo cobrado) | Gate 9 |
| E-mail SMTP | base 1.x | Gate 5 |

Adicionar uma integracao contratada = (1) adaptador em `provedores/`,
(2) entrada na composicao, (3) recurso no portao, (4) pacote do SDK na regra
de lint `sdks-bancarios-so-em-provedores`, (5) documentar em
`docs/seguranca/modelo-seguranca.md` o que sai da aplicacao.

## Regras de seguranca para adaptadores

- Credenciais so por variaveis de ambiente; nunca no banco em texto claro.
- Nunca registrar em log a resposta completa do provedor; apenas ids e contagens.
- Webhooks: validar assinatura com comparacao em tempo constante, gravar o
  corpo bruto, enfileirar tarefa e responder 200 rapido.
- Timeouts e retentativas com atraso crescente (via fila de tarefas).
- **Proibido scraping** (robo que navega no internet banking): fragil, inseguro
  e viola termos dos bancos.
- Toda chamada externa e uma tarefa em segundo plano, nunca dentro da
  requisicao do usuario (exceto verificacao de saude explicita).

## Canais de entrada de dados (Gate 1, secao 18-19)

`InputProvider` do Gate 1 corresponde a `LeitorExtrato` + o pipeline de
`importacao`. QR Code, NFC e Bluetooth (fases posteriores) serao leitores
opcionais no mesmo padrao, sempre com fallback manual; nao sao obrigatorios
para o produto funcionar.
