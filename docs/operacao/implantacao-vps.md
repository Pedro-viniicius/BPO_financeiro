# Implantacao em VPS — Nova Didata

> Gate 9. Modelo A (hospedagem gerida pelo fornecedor) rodando o mesmo
> Docker Compose do Modelo B. Ver `docs/arquitetura/modelos-deploy.md`.

## Por que o Modelo A

A Nova Didata e uma escola tecnica sem equipe de TI, e quem opera o
financeiro dia a dia e o BPO. Os outros dois modelos entregam ao cliente
tarefas que ele nao tem como assumir:

| | Quem aplica atualizacao | Quem confere o backup | Quem cuida do HTTPS |
|---|---|---|---|
| A — gerida | fornecedor | fornecedor | fornecedor |
| B — nuvem do cliente | cliente | cliente | cliente |
| C — servidor local | cliente | cliente (e o servidor pode queimar) | cliente |

O Modelo A nao e mais trabalho do que o B: e o **mesmo** compose, no mesmo
tipo de VPS. Muda so de quem e a conta e a responsabilidade. O Modelo C so se
justifica quando existe exigencia de os dados nao sairem da rede do cliente —
o que uma escola nao tem, e que em troca traz a parte mais dificil
(certificado interno, atualizacao offline, backup fisico para fora).

## Requisitos minimos do VPS

| Item | Minimo | Recomendado | Por que |
|---|---|---|---|
| CPU | 2 vCPU | 4 vCPU | O build da imagem e o pico; em regime, o Next.js e o PostgreSQL convivem folgados. Com 1 vCPU o build chega a travar. |
| RAM | 4 GB | 8 GB | PostgreSQL ~1 GB, aplicacao ~512 MB, tarefas ~256 MB, proxy ~64 MB. O `pnpm build` sozinho pede ~2 GB; com 2 GB e preciso construir a imagem fora. |
| Disco | 40 GB SSD | 80 GB SSD | Banco de um cliente deste porte cresce devagar (< 2 GB/ano); os **anexos do QR code** somam ~1,2 GB/ano (Gate 10); **backups com retencao de 30 dias** e as imagens Docker das versoes anteriores ocupam o resto. |
| Sistema | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS | Suporte ate 2029, Docker oficial, `unattended-upgrades` pronto. Debian 12 serve igual. |
| Rede | IPv4 dedicado | idem | O Let's Encrypt precisa alcancar a porta 80 no dominio. |
| Local | Brasil (idealmente SP) | idem | Latencia e, com dados de cliente brasileiro, jurisdicao. |

Swap de 2 GB ajuda a atravessar o pico do build sem derrubar o PostgreSQL.

## Checklist de seguranca do servidor

Antes de subir a aplicacao. Cada item vale por si; nenhum substitui outro.

- [ ] **Usuario sem root** para operar: `adduser financeiro && usermod -aG docker financeiro`.
      Todo o compose roda por ele. (Estar no grupo `docker` equivale a root —
      por isso esse usuario e so para isto, e nao o de uso geral.)
- [ ] **SSH somente por chave**: em `/etc/ssh/sshd_config`,
      `PasswordAuthentication no`, `PermitRootLogin no`, `PubkeyAuthentication yes`.
      Testar a entrada com chave em OUTRA sessao antes de fechar a atual.
- [ ] **Firewall**: `ufw default deny incoming`, liberar apenas `22`, `80`, `443`.
      A porta `5432` NUNCA e liberada — o banco so existe dentro da rede do
      compose, e acesso administrativo vai por tunel SSH.
- [ ] **Atualizacoes automaticas de seguranca**:
      `apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.
- [ ] **Fail2ban** no SSH (`apt install fail2ban`), para cortar forca bruta.
- [ ] **Fuso horario**: `timedatectl set-timezone America/Sao_Paulo`.
- [ ] **`.env` com permissao 600** e dono `financeiro`. O `implantar.sh` corrige
      se estiver diferente, mas o certo e nascer assim.
- [ ] **Segredos fora do git**: `./segredos/rclone.conf` (credenciais do backup
      remoto) fica so no servidor. `/segredos/` esta no `.gitignore`.
- [ ] **DNS antes do primeiro deploy**: `financeiro.novadidata.com.br` apontando
      para o IP do VPS. Sem isso o Caddy nao consegue o certificado, e sem
      HTTPS o sistema nao funciona — os cookies de sessao sao `Secure`.
- [ ] **Chave GPG do backup** gerada e a privada guardada FORA do servidor.
      Cifrar o backup com uma chave cuja privada mora no mesmo VPS nao protege
      nada.
- [ ] **Backup remoto conferido**: subir, esperar o primeiro ciclo e confirmar
      que o arquivo chegou ao destino.
- [ ] **`AUDITORIA_SAL_IP` gerado e guardado no cofre**, junto da chave GPG
      (Gate 10). Sem ele a aplicacao nao sobe; sem a copia, uma restauracao
      continua funcionando mas os IPs novos deixam de ser comparaveis com os
      antigos (prefixo `v1:` no hash).
- [ ] **Instalacao criada antes do Gate 10?** Rode uma vez, como
      `financeiro_admin`: `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO
      financeiro_backup;` — sem isso o `pg_dump` falha em
      `migracoes_aplicadas_id_seq` (achado do ensaio; os scripts novos ja
      concedem).
- [ ] **Anexos no backup** (Gate 10, ADR-027): o volume `arquivos` esta
      montado so-leitura no servico `backup`, e o log do primeiro ciclo mostra
      `anexos: N arquivo(s) vivo(s) conferido(s) no remoto`. A retencao alcanca
      o remoto por lista de chaves expurgadas, nunca por idade.
- [ ] **Restauracao dos anexos testada** com `ARQUIVOS_RESTAURACAO` (ver
      `docs/operacao/registro-restauracoes.md`): toda chave viva no banco
      restaurado precisa ter conteudo, chave a chave.
- [ ] **Espaco no remoto** dimensionado para 5 anos de documentos aprovados
      (~100 MB/mes de anexos neste porte).

## Primeira implantacao

```
1. Checklist acima.
2. git clone <repositorio> financeiro && cd financeiro
3. cp .env.producao.exemplo .env && chmod 600 .env    # preencher tudo
4. Editar scripts/banco/criar-usuarios.sql com as MESMAS senhas do .env.
   Ele roda uma unica vez, na criacao do volume do banco; depois disso,
   mudar o arquivo nao tem efeito.
5. mkdir -p segredos && rclone config --config segredos/rclone.conf
6. scripts/implantar.sh
7. Abrir https://<DOMINIO> e criar o primeiro administrador (primeiro acesso).
8. Conferir o backup: docker compose -f docker-compose.producao.yml logs backup
```

## Atualizacao

```
git pull
scripts/implantar.sh
```

O script faz backup antes, aplica as migracoes, sobe, confere `/api/saude` e —
se a aplicacao nao responder saudavel — **volta sozinho** para a versao
anterior.

## Reverter

```
scripts/reverter.sh            # volta para a versao anterior registrada
scripts/reverter.sh 20260923-5466e9c
```

Reverter troca a imagem. Se a versao nova tiver alterado o banco, a imagem
antiga pode nao entender o esquema novo — o script detecta isso, avisa e exige
confirmacao por extenso. O caminho seguro nesse caso e restaurar o backup que
o `implantar.sh` tirou minutos antes.

## Acesso administrativo ao banco

Nunca abrindo a porta. Tunel SSH:

```
ssh -L 5433:localhost:5432 financeiro@<ip-do-vps>
# e, em outro terminal, na sua maquina:
psql postgres://financeiro_aplicacao@localhost:5433/financeiro
```

Isso so funciona porque o compose publica a porta do banco apenas dentro da
rede dele; o tunel entra pelo SSH, que ja esta protegido por chave.
