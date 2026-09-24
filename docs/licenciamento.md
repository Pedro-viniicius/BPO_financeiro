# Licenciamento

> Politica de produto e arquitetura. **Este documento nao e um contrato e nao
> substitui a revisao de um advogado habilitado no Brasil.** O contrato
> comercial e o EULA (termo de licenca de uso) devem ser redigidos com
> assessoria juridica a partir destes principios.

## Conceito base

> A propriedade intelectual e o codigo-fonte permanecem pertencentes ao
> fornecedor.
> O cliente adquire direito de uso perpetuo da versao especificamente contratada.
> Novas versoes principais nao estao automaticamente incluidas.
> Suporte, manutencao, infraestrutura e novas integracoes podem ser
> contratados separadamente.

## 1. Propriedade do software

O software (codigo-fonte, binarios, documentacao, marca, design) e de
propriedade do fornecedor. A venda concede **licenca de uso**, nao transfere
propriedade. E vedado ao cliente redistribuir, sublicenciar, revender ou
disponibilizar o software a terceiros fora da instalacao licenciada.

## 2. Propriedade dos dados

**Os dados sao do cliente.** Tudo que o cliente registra (lancamentos,
cadastros, extratos, anexos, relatorios) pertence a ele. O fornecedor:
- nao acessa dados sem autorizacao (Modelo A: acesso restrito a operacao,
  registrado);
- entrega exportacao completa (backup PostgreSQL + anexos) a qualquer momento
  e ao fim da relacao;
- nao usa dados do cliente para treinar modelos nem para outros clientes.

## 3. Versao adquirida

A licenca identifica uma **versao principal** (ex.: *Financeiro 1.x*). O
cliente pode usar qualquer versao 1.x (1.0, 1.4, 1.9...) para sempre, em
quantas empresas/filiais a instalacao suportar, dentro de UMA instalacao
(ADR-005). Instalacoes adicionais (outro cliente, outro servidor com dados
distintos) exigem licenca propria.

A versao instalada e registrada em `package.json` (`version`) e no arquivo
`licenca.json` (`versaoPrincipal`).

## 4. Atualizacoes

| Tipo | Exemplo | Incluida? |
|---|---|---|
| Correcoes (patch) | 1.4.1 → 1.4.2 | sim, durante a vigencia da versao principal |
| Melhorias na mesma versao principal (minor) | 1.4 → 1.5 | sim |
| Nova versao principal (major) | 1.x → 2.x | **nao**; nova licenca ou upgrade pago |

"Incluida" significa direito de baixar/instalar; **aplicar** a atualizacao e
tarefa do operador (cliente em B/C; fornecedor em A mediante contrato de hospedagem).

## 5. Manutencao

Manutencao evolutiva (novas funcionalidades alem das planejadas para a versao)
e manutencao adaptativa (mudanca de legislacao, de banco parceiro) sao
servicos contratados. Correcao de defeitos da versao licenciada e coberta pelo
periodo de garantia definido em contrato.

## 6. Suporte

Nao incluso na compra da licenca. Planos de suporte (horario comercial, SLA,
canal) sao contratos separados. Sem plano, o cliente conta com a documentacao
(`docs/`) e a comunidade/base de conhecimento, se houver.

## 7. Integracoes

Cada integracao (banco/Open Finance, contabil, PIX/boleto, ERP, IA) e um
**modulo/adaptador contratado a parte** e ativado pelo portao de recursos
(ADR-013). Tarifas de terceiros (agregador de Open Finance, provedor de IA,
emissao de boletos) sao pagas pelo cliente ou repassadas, conforme contrato.
O fornecedor nao garante disponibilidade de servicos de terceiros.

## 8. Infraestrutura e hospedagem

| Modelo | Infraestrutura | Custo |
|---|---|---|
| A — gerida | do fornecedor | contrato de hospedagem mensal/anual, separado da licenca |
| B — nuvem do cliente | do cliente | por conta do cliente |
| C — servidor local | do cliente | por conta do cliente |

Encerrado o contrato de hospedagem (A), o cliente recebe backup completo e
pode continuar usando a versao licenciada em B ou C. A licenca perpetua nao
obriga o fornecedor a hospedar indefinidamente.

## 9. Codigo-fonte

O codigo-fonte nao e entregue por padrao. Podem ser negociados: (a) deposito
em custodia (*escrow*) liberado em caso de descontinuidade do fornecedor;
(b) licenca de codigo para desenvolvimento interno, com restricoes de uso.
Ambos por contrato especifico.

## 10. Software de terceiros

O produto usa bibliotecas de codigo aberto sob licencas permissivas (MIT,
ISC, BSD, Apache-2.0) e, em poucos casos, copyleft fraco (MPL-2.0, ex.:
`lightningcss`, usada apenas no build). `pnpm verificar:licencas` gera o
inventario e falha se surgir licenca incompativel (GPL/AGPL/SSPL). O
inventario deve acompanhar a entrega (avisos de licenca de terceiros).
Software de terceiros permanece sob suas proprias licencas.

**Codigo de terceiro incorporado ao repositorio** (nao vem de `node_modules`,
entao o `license-checker` nao o ve). O inventario abaixo e conferido pelo
mesmo `pnpm verificar:licencas`, que falha se o arquivo sumir ou se o aviso de
licenca do autor for removido:

| Arquivo | Autor | Licenca | Decisao |
|---|---|---|---|
| `src/compartilhado/qr/qrcodegen.ts` | Project Nayuki | MIT | ADR-028 |

A licenca MIT exige manter o aviso de direitos autorais em toda copia. O
cabecalho original permanece no arquivo, seguido da lista das modificacoes
locais; um teste reconstroi o original a partir da copia e confere o hash.

## 11. Provedores de inteligencia artificial

- A IA e recurso contratado a parte (`analises_ia`), desligada por padrao.
- O consumo de API e cobrado conforme uso (do cliente ou repassado).
- Ao usar provedor externo, dados agregados saem da instalacao conforme o
  quadro em `docs/arquitetura/inteligencia-artificial.md`; o cliente deve
  aceitar isso explicitamente ao ativar (Gate 9).
- O fornecedor nao se responsabiliza por decisoes tomadas com base em
  analises da IA; o produto apresenta premissas e incertezas e a decisao e humana.
- Provedor local (Modelo C) nao envia dados para fora.

## 12. Implementacao tecnica (resumo)

- `licenca.json`: cliente, versao principal, recursos contratados, data,
  assinatura (verificacao no Gate 10).
- Sem arquivo → modo base da versao 1.x; o produto nunca "trava" por falta de
  contato com o fornecedor.
- O dominio financeiro nao conhece a licenca; consulta `PortaoRecursos`.

## 13. Pendencias para o juridico

- Redigir EULA e contrato de hospedagem a partir deste documento.
- Definir periodo de garantia e SLA padrao.
- Definir regras de custodia de codigo.
- Revisar clausulas de LGPD (controlador/operador) por modelo de deploy.
