# Modelos de Deploy (Implantacao)

> Gate 2 · ADR-009. "Deploy" = colocar a aplicacao para rodar em um servidor.
> O mesmo codigo e a mesma imagem Docker servem para os tres modelos.

## Visao comparativa

| | Modelo A — Hospedagem gerida | Modelo B — Nuvem do cliente | Modelo C — Servidor local |
|---|---|---|---|
| Quem opera | fornecedor (servico contratado) | cliente (ou parceiro de TI) | cliente |
| Onde roda | plataforma/VPS do fornecedor, uma instancia por cliente | VPS/nuvem do cliente | servidor na rede do cliente ("on-premises") |
| Banco | PostgreSQL dedicado por cliente | PostgreSQL no compose ou gerido pelo cliente | PostgreSQL no compose |
| Internet | sim | sim | controlada; integracoes podem exigir liberacao |
| Atualizacoes | fornecedor aplica | cliente puxa nova imagem | cliente importa imagem (pode ser offline) |
| Indicado para | pequenas empresas sem TI | empresas com TI, escritorios de BPO | quem exige dados internos |
| Licenca | mesma (perpetua por versao); hospedagem cobrada a parte | mesma | mesma |

Em todos: **licenca de software e hospedagem sao contratos separados.**

## Modelo A — Hospedagem gerida

```
Internet
   │ HTTPS
   ▼
Proxy / plataforma (TLS, firewall, limite de requisicoes)
   │
   ▼
Aplicacao Next.js (container)  +  Processo de tarefas (container)
   │
   ▼
PostgreSQL dedicado deste cliente (backup automatico, retencao 30 dias)
```

- Uma instancia (aplicacao + tarefas + banco) por cliente. Nunca banco compartilhado.
- Pode ser uma plataforma de containers (Fluid Compute/Railway/Fly/Render)
  ou VPS com o mesmo compose do Modelo B. A aplicacao nao depende de nenhuma
  delas: se rodar Node 22 e falar com PostgreSQL, funciona.
- Segredos na plataforma; nunca em arquivo versionado.
- O fornecedor mantem um inventario de instancias (cliente, versao, URL,
  data do ultimo backup testado).

## Modelo B — Nuvem do cliente

```
VPS ou nuvem do cliente
└── Docker Compose
    ├── banco       PostgreSQL 17 (volume persistente)
    ├── migracao    aplica migracoes e encerra
    ├── aplicacao   Next.js :3000 (so em 127.0.0.1)
    ├── tarefas     executor de tarefas
    └── backup      pg_dump diario para ./backups
Proxy reverso com HTTPS na frente (Caddy recomendado: certificado automatico)
```

Passo a passo:

```
1. Instale Docker e Docker Compose no servidor (Ubuntu 22.04+ recomendado).
2. git clone <repositorio> financeiro && cd financeiro   (ou extraia o pacote da versao)
3. cp .env.exemplo .env   e preencha:
     BANCO_SENHA_ADMIN, BANCO_SENHA_APLICACAO, BANCO_SENHA_MIGRACAO, BANCO_SENHA_BACKUP
       (o compose entrega ao banco; o script de inicializacao cria os usuarios com elas)
     BANCO_URL, BANCO_URL_MIGRACAO (as MESMAS senhas da aplicacao e da migracao)
     APLICACAO_URL=https://financeiro.suaempresa.com.br
     APLICACAO_SEGREDO=$(openssl rand -base64 48)
     AUDITORIA_SAL_IP=$(openssl rand -base64 48)   # guarde a copia no cofre, junto da chave GPG
4. Nada a editar em arquivo versionado: scripts/banco/10-criar-usuarios.sh
   le as BANCO_SENHA_* do ambiente na criacao do volume (uma unica vez) e se
   recusa a rodar com valor vazio ou de exemplo.
5. docker compose up -d
6. docker compose logs migracao   → "Migracoes aplicadas com sucesso."
7. curl http://127.0.0.1:3000/api/saude → {"situacao":"ok","banco":"ok"}
8. Configure o proxy HTTPS. Ele PRECISA cortar o corpo do envio publico de
   documentos em 41 MB (a aplicacao tambem limita pelos bytes que chegam, mas
   o corte antes dela poupa rede e memoria). Exemplo Caddy:
     financeiro.suaempresa.com.br {
       @recebimento path_regexp ^/enviar/[A-Za-z0-9_-]{22}/receber$
       request_body @recebimento { max_size 41MB }
       reverse_proxy 127.0.0.1:3000
     }
   No Nginx: `client_max_body_size 41m;` no `location ~ ^/enviar/.+/receber$`.
9. Crie o primeiro usuario administrador (instalador — Gate 5).
```

Atualizacao de versao:

```
git pull (ou extraia o novo pacote)
docker compose build
docker compose up -d        # o servico migracao roda antes da aplicacao
```

Antes de atualizar: faca um backup manual (`docker compose exec backup /backup.sh`).

## Modelo C — Servidor local

```
Rede do cliente
└── Servidor (Linux; Windows com WSL2/Docker Desktop tambem funciona)
    ├── Aplicacao + tarefas (Docker Compose, igual ao Modelo B)
    ├── PostgreSQL (compose)
    └── Backup (compose → pasta local → copia para fora do servidor!)
Acesso pelos computadores da rede: https://financeiro.local (certificado
interno) ou http em rede confiavel (nao recomendado; cookies Secure exigem HTTPS
em producao).
```

Diferencas em relacao ao B:
- **Internet controlada**: liberar saida apenas para o que for contratado
  (provedor de IA, Open Finance, SMTP). Sem internet, IA fica "desligada" e
  extratos entram por arquivo OFX/CSV.
- **Atualizacao offline**: o fornecedor entrega a imagem
  (`docker save financeiro:1.4.2 | gzip > financeiro-1.4.2.tar.gz`); o cliente
  faz `docker load` e `docker compose up -d`.
- **Backup fora do servidor** e obrigatorio: um servidor local queima, alaga
  ou e roubado. Copiar `./backups` para outro local (NAS, nuvem, disco externo)
  diariamente.

Nada alem disso foi implementado para o Modelo C no Gate 2; a arquitetura
apenas garante compatibilidade (sem dependencia de servico externo obrigatorio).

## Arquivos de implantacao

| Arquivo | Funcao |
|---|---|
| `Dockerfile` | imagem multi-etapa; roda como usuario `financeiro` (nao root); `HEALTHCHECK` em `/api/saude` |
| `docker-compose.yml` | os cinco servicos; porta 3000 apenas em 127.0.0.1; banco sem porta publica |
| `.env.exemplo` | todas as variaveis, comentadas em portugues |
| `scripts/banco/10-criar-usuarios.sh` | usuarios do PostgreSQL com menor privilegio; senhas lidas do ambiente |
| `scripts/backup.sh` | `pg_dump` + sha256 + retencao + GPG opcional |
| `scripts/restaurar.sh` | restauracao em banco separado; exige confirmacao explicita para producao |

## Backup

| Item | Definicao |
|---|---|
| Automatico | servico `backup` roda `scripts/backup.sh` a cada 24h |
| Formato | `pg_dump --format=custom` comprimido + arquivo `.sha256` |
| Retencao | `BACKUP_RETENCAO_DIAS` (padrao 30) |
| Criptografia | opcional com `BACKUP_CHAVE_PUBLICA_GPG` (recomendado sempre que o backup sair do servidor) |
| Fora do servidor | responsabilidade do operador (A: fornecedor; B/C: cliente) — copiar `./backups` para outro local |
| Anexos | volume `arquivos` deve ser copiado junto (Gate 5 definira o armazenamento) |

## Restauracao

**Um backup que nunca foi restaurado com sucesso nao e um backup.**

Teste mensal (obrigatorio no Modelo A; recomendado em B/C):

```
docker compose exec backup sh -c 'PGUSER=financeiro_admin PGPASSWORD=$BANCO_SENHA_ADMIN /restaurar.sh /backups/financeiro-AAAAMMDD-HHMMSS.dump'
# restaura em `financeiro_restauracao`, confere sha256 e conta empresas/eventos
```

Registrar data, arquivo e resultado em `docs/operacao/registro-restauracoes.md`
(criado no Gate 10).

Recuperacao real (banco de producao perdido):
1. `docker compose stop aplicacao tarefas`
2. `scripts/restaurar.sh <arquivo> financeiro` → digitar `RESTAURAR PRODUCAO`
3. `docker compose up -d` (migracao confirma que nada esta pendente)
4. Conferir `/api/saude` e a tela Hoje; registrar o incidente.

## Portabilidade entre modelos

Migrar de B/C para A (ou o inverso) = restaurar o backup na nova instalacao
e copiar os anexos. Nao ha nada especifico de modelo no banco.

## O que NAO fazer

- Nao criar `codigo-do-cliente-x/`. Comportamento por cliente vem de
  configuracao, licenca (portao de recursos), adaptadores e permissoes.
- Nao expor a porta do PostgreSQL na internet.
- Nao rodar a aplicacao com o usuario `financeiro_admin` do banco.
- Nao pular o backup antes de atualizar.
