# ADR-027 — Onde o arquivo mora, e como o backup passa a cobri-lo

**Status:** Aceita · 2026-09-24 · Complementa a ADR-009 (modelos de deploy) e a ADR-019 (retencao)

## Contexto

Ate o Gate 10, o sistema tinha um armazenamento de arquivos pronto e parado:
contrato `ArmazenamentoArquivos`, implementacao em disco, tabela `arquivos`
(metadados, SHA-256, `removido_em`) e o volume `arquivos` no Compose — sem
um unico consumidor. O `scripts/backup.sh` cobria so o banco: um backup
restaurado traria a linha da nota fiscal e nao a nota fiscal. A captura por QR
code e o primeiro consumidor real, e nota fiscal e documento com prazo de
guarda legal.

## Decisao

**Disco local, pelo `ArmazenamentoArquivosLocal` que ja existia, no volume
`arquivos` do Compose.** Sem armazenamento de objetos neste gate. A chave de
cada arquivo tem espaco por empresa (`<empresa>/<ano>/<mes>/<uuid>.bin`), e o
mesmo conteudo (mesmo SHA-256) e reaproveitado dentro da empresa: um anexo
aponta para o arquivo, e o arquivo pode servir a mais de um documento.

**O backup passa a cobrir os arquivos — antes do banco.** A ordem nao e
detalhe: chaves nunca mudam, entao copiando arquivos primeiro e banco depois,
a pior consequencia da janela entre os dois e um arquivo sem linha (lixo
inofensivo). Na ordem inversa, seria uma linha apontando para arquivo que o
backup nao tem — exatamente o estrago a evitar. A copia e incremental de
graca (`rclone copy` so envia o que falta) e o custo diario tende ao tamanho
do que entrou no dia. A falha da copia e ERRO, como ja era para o dump.

**A retencao alcanca a copia remota por lista explicita, nunca por idade.**
`rclone copy` nunca apaga, e apagar por idade destruiria arquivo antigo que
ainda esta vigente — arquivo antigo nao e arquivo vencido. O mecanismo:

1. a tarefa de expurgo remove o conteudo do disco e grava
   `arquivos.removido_em` — **so quando nenhuma linha viva referencia o
   arquivo** (o conteudo e compartilhado por hash);
2. o backup le do banco as chaves com `removido_em` recente e as apaga do
   remoto **uma a uma**, por lista (`rclone delete --files-from`);
3. um arquivo que sumiu do disco por qualquer outro motivo **nao** e apagado
   do remoto — e precisamente o caso em que o remoto salva.

**Conferencia chave a chave, nao por contagem.** Todo arquivo vivo no banco
precisa existir no remoto (backup) e no disco restaurado (restauracao).
Contar nao basta: orfaos inflam o numero. O `restaurar.sh` falha se uma
chave viva nao tiver conteudo.

**Anexos no pacote de exportacao, em partes mensais.** O ZIP de dados continua
unico; os anexos saem em um ZIP por mes, metodo STORE (imagem e PDF ja sao
comprimidos), com LEIAME listando as partes e o SHA-256 de cada arquivo, e
mensagem em portugues se uma parte passar do teto. Uma exportacao por vez por
empresa. O escritor de ZIP nao tem ZIP64 e monta o pacote em memoria — e a
memoria que limita, nao o formato; partes mensais mantem cada uma pequena.

## Alternativas consideradas

- **Armazenamento de objetos (S3 compativel)** — rejeitada agora: poe
  credencial de terceiro no caminho de documento fiscal de cliente, contraria
  o alvo "VPS com Compose" e adiciona dependencia. O contrato deixa a porta
  aberta: e uma implementacao a mais, nada acima dela muda.
- **Binario no Postgres (`bytea`)** — rejeitada: mata o problema de backup
  trivialmente, mas incha o dump, torna a restauracao lenta e joga fora um
  modulo pronto.
- **`rclone sync` (espelho com exclusao)** — rejeitada: um disco perdido ou
  um ransomware seriam espelhados para o remoto na proxima noite. O remoto so
  apaga o que o sistema declarou expurgado.

## Consequencias

- O volume `arquivos` vira dado de producao: entra no backup (montado
  so-leitura no servico), no teste de restauracao e no checklist da VPS.
- Backups crescem com os anexos; o remoto precisa de espaco para 5 anos de
  documentos aprovados.
- A demonstracao na Vercel nao tem disco persistente: a captura fica
  desligada la, com aviso.
