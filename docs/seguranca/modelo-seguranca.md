# Modelo de Seguranca

> Gate 2 · Este documento descreve como o sistema protege dados financeiros.
> Itens marcados **(Gate N)** ainda serao implementados; os demais existem e,
> quando indicado, foram verificados em ambiente real durante o Gate 2.

## 1. Autenticacao (quem e o usuario)

- Better Auth com PostgreSQL local (sem SaaS externo). ADR-006.
- E-mail + senha: minimo 10 e maximo 128 caracteres; hash scrypt pela
  biblioteca; senha nunca aparece em log (redacao automatica de chaves
  `senha`, `password`, `token`, `segredo`...). *Verificado: senha curta
  rejeitada com `PASSWORD_TOO_SHORT`.*
- Verificacao em duas etapas (TOTP) com codigos de recuperacao; contador de
  falhas e bloqueio temporario na tabela `two_factor`.
- "Continuar com Google" (OAuth/OIDC) opcional; um so conceito de login social.
- Cadastro publico so para o primeiro usuario da instalacao; depois, em
  producao, recusado ANTES da biblioteca (`tratarRequisicaoAutenticacao`),
  com a mesma resposta 403 para e-mail existente e inexistente — a rota de
  cadastro nao confirma quem tem conta. A entrada por convite nao passa por
  essa rota: `aceitarConvite` valida o TOKEN e marca a criacao como
  autorizada (`criacaoAutorizada`, `AsyncLocalStorage`); o gancho
  `user.create.before` so aceita essa marca ou o cadastro aberto. Nunca o
  e-mail: "existe convite para este e-mail" era pergunta que qualquer um
  fazia a rota publica (auditoria de seguranca, VULN-03/05).
- Entrar/criar conta pela interface passam pelo handler HTTP da biblioteca:
  limite de 5 tentativas/min por IP vale tambem para o formulario
  (*verificado: 6a tentativa recebe "Muitas tentativas"*). Mensagem identica
  para senha errada e e-mail inexistente.
- Verificacao de e-mail obrigatoria: adiada ate existir envio de e-mail.
- Passkeys e SSO: compativeis (plugins da mesma biblioteca), nao ativados.
- **(gate de usuarios)** reautenticacao para acoes sensiveis (alterar e-mail,
  desativar 2FA, aprovar pagamentos acima de limite, exportar dados) e tela
  do segundo fator no login.

## 2. Sessoes

- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` em producao, prefixo `financeiro`.
- Validade 7 dias, renovada a cada dia de uso.
- Sem cache de sessao em cookie: toda requisicao consulta o banco; revogar
  (sair, redefinir senha, remover vinculo) vale na hora. *Verificado:
  `get-session` devolve `null` imediatamente apos `sign-out`.*
- Redefinicao de senha revoga todas as sessoes. A falha do provedor de
  e-mail vai para o log e NAO muda a resposta ao navegador: uma resposta
  diferente diria quais e-mails existem.
- "Redefinir acesso" (tela de usuarios) gera um link que troca a senha de
  outra pessoa: ele vai SO para o e-mail dela, nunca para a tela do
  administrador, e e recusado quando a conta serve tambem a outra
  organizacao (`RedefinicaoNaoPermitida`). Sem servidor de e-mail, a pessoa
  usa "Esqueci minha senha".
- Sair revoga a sessao no banco e apaga o cookie de empresa ativa.
- **(gate de usuarios)** lista de sessoes ativas na tela do usuario, com "encerrar".

## 3. Autorizacao (o que pode fazer)

- Permissoes granulares em portugues; papeis como conjuntos; negar por padrao. ADR-007.
- Verificacao **no servidor**, no inicio de cada caso de uso, com
  `exigirPermissao(contexto, permissao)`. Esconder botao nao e controle de acesso.
- Escopo de empresa obrigatorio em todo repositorio (`EscopoEmpresa`).
  Usuario sem vinculo com a empresa → `UsuarioSemAcessoAEmpresa`.
- **Empresa ativa** (Gate 5, ADR-025): resolvida no servidor a cada
  requisicao a partir dos vinculos ativos do usuario; o cookie
  `financeiro.empresa-ativa` e preferencia, nunca prova. Id de empresa vindo
  de URL, cookie, formulario ou cabecalho nunca autoriza sozinho. Detalhe em
  [`../arquitetura/autenticacao-e-empresa-ativa.md`](../arquitetura/autenticacao-e-empresa-ativa.md).
- Segregacao de funcoes: papel Financeiro nao aprova; regra de dominio
  `AprovacaoPeloProprioAutor` impede aprovar o que se registrou.
- Gestao de usuarios com escopo POR EMPRESA: alterar papel, desativar e
  redefinir acesso so alcancam o vinculo da pessoa com a empresa ativa
  (`condicaoDoVinculo`); a contagem de "ultimo administrador" e por empresa.
  Vinculos "toda a organizacao" aparecem na lista mas nao sao alterados por
  essa tela (`repositorio-gestao-usuarios.escopo.teste.ts`).
- Isolamento entre empresas coberto por testes unitarios
  (`trocar-empresa-ativa.teste.ts`) e de integracao no PostgreSQL
  (`acesso-empresas.teste.ts`): A nao enxerga, nao ativa e nao opera a
  empresa de B, mesmo adulterando cookie ou formulario. Cada modulo
  financeiro futuro acrescenta o seu teste sobre esta base.

## 4. Segredos

- Somente por variaveis de ambiente (`.env` fora do git) ou gerenciador de
  segredos da plataforma. `.env.exemplo` documenta cada variavel sem valores reais.
- `APLICACAO_SEGREDO` ≥ 32 caracteres; validado na inicializacao.
- `AUDITORIA_SAL_IP` ≥ 32 caracteres: sal do HMAC que anonimiza o IP na
  trilha de auditoria e no limite de tentativas da captura publica.
  Obrigatorio em producao e demonstracao (o boot falha sem ele). NUNCA vai
  para o banco: IPv4 tem 4 bilhoes de enderecos, e com o sal em maos um dump
  vazado se reverte em segundos. A copia vive no mesmo cofre da chave GPG do
  backup. Trocar o sal nao e rotina — e resposta a comprometimento — e o
  prefixo de geracao (`v1:`) torna visivel onde a trilha deixou de ser
  comparavel.
- Credenciais de integracoes: variaveis de ambiente; nunca no banco em texto claro.
- Nunca em log: senhas, tokens, credenciais bancarias, cookies, chaves de API.
  O registrador de logs redige automaticamente chaves sensiveis (testado).
- Scripts de instalacao pedem para trocar `troque-esta-senha` antes de produzao.

## 5. Auditoria e logs

- Auditoria financeira: tabela `eventos_auditoria`, somente insercao, na
  mesma transacao da operacao. ADR-008. *Verificado: aplicacao nao consegue
  UPDATE/DELETE; gatilho bloqueia ate o usuario de migracao.*
- Logs tecnicos: JSON estruturado por linha, nivel configuravel, `requisicaoId`
  para correlacao, sem dados sensiveis. Nunca substituem a auditoria.
- Payloads financeiros completos nao vao para log; apenas ids, contagens e duracoes.

## 6. Banco de dados

- Quatro usuarios com menor privilegio (aplicacao, migracao, backup,
  administrador). A aplicacao nunca e superusuario. *Verificado.*
- Porta do PostgreSQL nao exposta publicamente (compose sem `ports`).
- Migracoes versionadas; nada manual em producao; nada destrutivo automatico.
- Isolamento por empresa na camada de repositorio; RLS a avaliar como reforco.
- **(Gate 3)** revisao coluna a coluna de quais dados pessoais existem (LGPD).

## 7. Transporte e cabecalhos

- HTTPS obrigatorio em producao (proxy reverso: Caddy/Nginx/plataforma).
- Cabecalhos definidos na propria aplicacao (valem em qualquer hospedagem):
  `Strict-Transport-Security` (2 anos, subdominios), `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microfone,
  geolocalizacao desligados), sem `X-Powered-By`. *Verificado com `curl -I`.*
- **(Gate 5)** `Content-Security-Policy` com nonce apos definir bibliotecas de interface.

## 8. Limite de requisicoes (rate limiting)

- Autenticacao: 60 req/min por IP no geral; 5 tentativas de login/min;
  3 pedidos de redefinicao de senha/5 min; 5 verificacoes TOTP/min.
  *Verificado: 6a tentativa de login → HTTP 429.*
- **(Gate 5)** limites para importacao e exportacao por usuario.
- Modelo A: limite adicional no proxy/plataforma.

## 9. Validacao de entrada

- Tudo que entra passa por esquema Zod com mensagens em portugues:
  formularios, rotas, importacoes, variaveis de ambiente.
- Dinheiro: `Dinheiro.deTexto`/`deTextoBrasileiro` rejeitam formatos invalidos
  e casas decimais a mais. Datas: `DataCivil` rejeita datas inexistentes.
- CPF/CNPJ validados por digito verificador.

## 10. CSRF (falsificacao de requisicao entre sites)

- Cookies `SameSite=Lax` + verificacao de `Origin` pelo Better Auth nas rotas
  de autenticacao (`trustedOrigins` = `APLICACAO_URL`).
- Server actions do Next.js verificam origem por padrao.
- As acoes de entrar/criar conta repassam o `Origin` do navegador ao Better
  Auth, que o confere contra `trustedOrigins`.
- **(quando existirem)** rotas de API proprias que aceitem cookie exigirao
  cabecalho `Origin` compativel ou token.

## 11. Injecao de SQL

- Drizzle parametriza tudo; `sql\`...\`` tambem parametriza interpolacoes.
- Proibido montar SQL com concatenacao de texto (revisao de codigo).
- Usuario da aplicacao sem DDL limita o dano de uma falha hipotetica.

## 12. XSS (injecao de script na tela)

- React escapa por padrao; `dangerouslySetInnerHTML` proibido salvo revisao explicita.
- **(Gate 5)** CSP com nonce.

## 13. Arquivos enviados (anexos, extratos)

- Contrato `ArmazenamentoArquivos`: tipos permitidos (PDF, PNG, JPEG, CSV,
  TXT, OFX, XLSX), tamanho maximo 15 MB, chave opaca gerada pelo sistema
  (nome original nunca vira caminho), hash SHA-256.
- Verificacao do tipo pelo conteudo (assinatura de bytes), nao so pela
  extensao (ADR-032). CSV exportado sem execucao de formulas: `campoCsv`
  prefixa `'` em celulas que comecam com `=`, `+`, `-`, `@`, tabulacao ou
  retorno de carro (demonstrativo e pacote completo).
- Anexos servidos com `Content-Disposition: attachment` e sem execucao.

## 14. Integracoes externas

- Portas e adaptadores; SDKs confinados a `provedores/` por lint. ADR-011.
- Webhooks: assinatura validada em tempo constante; corpo bruto gravado;
  processamento em tarefa.
- Chamadas externas sempre em tarefas, com timeout e retentativa.
- Proibido scraping bancario.

## 15. Inteligencia artificial

- Somente leitura; gateway unico; politica de dados que remove campos nao
  previstos e bloqueia CPF/e-mail (testado). ADR-010.
- Quadro "o que sai da aplicacao" em `docs/arquitetura/inteligencia-artificial.md`.
- Desligada por padrao; nada sai sem contratacao e configuracao.

## 16. Backup e restauracao

- `pg_dump` diario, sha256, retencao 30 dias, GPG opcional (recomendado
  quando o backup sai do servidor).
- Restauracao testada em banco separado por `scripts/restaurar.sh`;
  sobrescrever producao exige digitar `RESTAURAR PRODUCAO`.
- Politica: backup nunca restaurado = backup inexistente. Teste mensal registrado.

## 17. Dependencias e cadeia de suprimentos

- Versoes fixadas no `package.json`; `pnpm install --frozen-lockfile` na CI.
- Scripts de instalacao de pacotes bloqueados por padrao (`allowBuilds` explicito).
- `pnpm verificar:licencas` falha em licencas incompativeis (GPL/AGPL/SSPL).
- **(Gate 10)** auditoria de vulnerabilidades (`pnpm audit`) na CI com politica de excecoes.

## 18. Imagem e execucao

- Container roda como usuario `financeiro` (nao root); imagem `alpine` enxuta.
- Aplicacao escuta apenas em `127.0.0.1:3000` no host; proxy faz TLS.
- `HEALTHCHECK` em `/api/saude` sem expor detalhes internos.

## 19. LGPD (visao de seguranca)

- Minimizacao: so dados necessarios (CNPJ/CPF opcionais em cadastros).
- Dados pessoais de funcionarios nao entram no sistema (folha e agregada).
- Exclusao logica com lixeira; exclusao fisica so por rotina de retencao documentada.
- **(Gate 10)** `docs/lgpd.md`: inventario de dados, finalidades, retencao,
  exportacao e exclusao a pedido do titular.

## 20. Resposta a incidentes (resumo; detalhado no Gate 10)

1. Isolar (parar `aplicacao`/`tarefas`, revogar sessoes: `DELETE FROM session`).
2. Preservar evidencias (backup imediato, logs).
3. Investigar pela auditoria (`eventos_auditoria`) e logs por `requisicaoId`.
4. Corrigir, restaurar se necessario, trocar segredos.
5. Comunicar cliente e, se aplicavel, ANPD conforme LGPD.
