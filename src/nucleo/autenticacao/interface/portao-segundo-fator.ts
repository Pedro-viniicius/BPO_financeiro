/**
 * Portao do segundo fator (TOTP).
 *
 * O plugin `twoFactor` do Better Auth expoe, sob `/api/autenticacao/`, tanto a
 * ATIVACAO (`enable`, `get-totp-uri`, `generate-backup-codes`) quanto a
 * VERIFICACAO (`verify-totp`, `verify-backup-code`) e o desligamento (`disable`).
 *
 * A verificacao tem tela (`/verificacao-duas-etapas`). A ativacao NAO tem:
 * exigiria mostrar o QR Code, guardar os codigos de recuperacao e confirmar a
 * senha — uma tela inteira, com implicacoes de suporte, que nao cabe neste
 * MVP. Enquanto ela nao existir, ativar o segundo fator pela API crua deixaria
 * a conta com um fator que a pessoa nao consegue guardar direito.
 *
 * Por isso a ativacao fica fechada e a verificacao continua aberta:
 *
 * - ninguem consegue se trancar para fora (nao da para ativar);
 * - quem ja tiver o segundo fator ligado ainda entra normalmente;
 * - `disable` segue aberto — fechar a saida seria o proprio problema.
 *
 * Isto NAO enfraquece um controle existente: o segundo fator nunca chegou a
 * ser utilizavel, porque nunca houve tela para ativa-lo nem para verifica-lo.
 * Quando a tela de ativacao existir, apague este arquivo e a checagem na rota.
 */

/** Caminhos de ATIVACAO, relativos a `/api/autenticacao`. */
const CAMINHOS_DE_ATIVACAO: readonly string[] = [
  "/two-factor/enable",
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
];

export const MOTIVO_ATIVACAO_INDISPONIVEL =
  "A verificacao em duas etapas ainda nao pode ser ativada nesta versao: a tela que mostra o QR Code e os codigos de recuperacao ainda nao existe.";

/**
 * Verdadeiro quando o caminho pedido ativa (ou prepara a ativacao do) segundo
 * fator. Compara so o caminho, ignorando query e barra final.
 */
export function ehAtivacaoDeSegundoFator(caminho: string): boolean {
  const semQuery = caminho.split(/[?#]/)[0] ?? caminho;
  const normalizado = semQuery.length > 1 && semQuery.endsWith("/") ? semQuery.slice(0, -1) : semQuery;
  const depoisDaBase = normalizado.replace(/^.*\/api\/autenticacao/, "");
  return CAMINHOS_DE_ATIVACAO.includes(depoisDaBase.toLowerCase());
}
