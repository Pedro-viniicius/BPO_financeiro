# Ambiente de demonstracao (Vercel)

> Gate 9. Decisao: a **producao** da Nova Didata roda em VPS com Docker
> Compose (`docs/operacao/implantacao-vps.md`). A Vercel serve como **vitrine**
> — uma URL para mostrar o sistema e uma previa por pull request.

## O que este ambiente e, e o que ele nao e

E o mesmo codigo, com um banco proprio e descartavel. **Nao e producao**, e
isso aparece na tela: toda pagina do sistema mostra uma faixa
"Ambiente de demonstração — os dados daqui podem ser apagados a qualquer
momento. Não lance informação real."

A faixa nao e fechavel de proposito. Uma vitrine identica ao sistema real e um
convite a lancar dado de verdade nela; e dado de verdade num lugar sem backup
e um problema que so aparece no dia em que alguem precisa dele.

## Quatro partes da arquitetura NAO existem aqui

| Parte | No VPS | Na demonstracao |
|---|---|---|
| PostgreSQL | contêiner do compose | banco gerido, contratado na Vercel |
| `tarefas` (processo continuo) | contêiner sempre ligado | **nao roda**. O que depende dele (lembretes, recorrencias) nao acontece. |
| `backup` diario + copia remota | contêiner, testado | **nao existe**. O que houver de backup e o do provedor do banco. |
| anexos (volume `arquivos`) | volume persistente | **nao persiste**. A Vercel nao tem disco entre requisicoes. |

Nenhuma delas e defeito: sao consequencias de a vitrine ser um ambiente sem
servidor proprio. Estao aqui escritas para ninguem prometer ao cliente, na
demonstracao, algo que a demonstracao nao faz.

## Variaveis

Configuradas no painel da Vercel (Settings -> Environment Variables), nunca em
arquivo versionado:

```
AMBIENTE=demonstracao        # e o que liga a faixa na tela
BANCO_URL=<do banco gerido>
BANCO_URL_MIGRACAO=<do banco gerido>
APLICACAO_URL=https://<dominio-da-demonstracao>
APLICACAO_SEGREDO=<openssl rand -base64 48>
EMAIL_PROVEDOR=console       # convites saem como link, sem enviar e-mail
IA_PROVEDOR=desligado
```

`BANCO_URL_TESTE` **nao** deve existir aqui: os testes apagam dados.

## Por que os deploys ficavam bloqueados, e o que resolveu

A Vercel recusa um deploy quando o autor do commit nao pertence ao time:

> Git author projetoagropcp-afk must have access to the project on Vercel to
> create deployments.

Foi a causa dos deploys falhados de 20/09 e dos checks eternamente "queued":
os commits vinham assinados por `projetoagropcp-afk`, e o time e
`Pedro Queiroz's projects`.

**Resolvido em 2026-09-23** trocando o autor dos commits DESTE repositorio:

```sh
git config user.name "Pedro-viniicius"
git config user.email "pedro.navez.ns@gmail.com"
```

Configuracao LOCAL, de proposito: o `--global` continua apontando para a outra
conta, e mexer nele mudaria a autoria de todos os outros projetos da maquina.
Quem clonar este repositorio em outra maquina precisa repetir os dois comandos
— senao os deploys voltam a ser bloqueados, com a mesma mensagem.

Os commits ANTERIORES a essa troca continuam com o autor antigo; isso nao
atrapalha, porque a Vercel olha o autor do commit que dispara o deploy.

## Migracoes

O banco gerido precisa das migracoes aplicadas. Na Vercel isso nao acontece
sozinho: rodar `pnpm banco:migrar` apontando `BANCO_URL_MIGRACAO` para o banco
da demonstracao, a partir de uma maquina com acesso.
