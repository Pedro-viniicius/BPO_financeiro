import type { IdEmpresa, IdFilial, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";

import type { Papel } from "./papeis";
import type { Permissao } from "./permissoes";

/**
 * Quem esta agindo e em qual empresa.
 *
 * Montado uma vez por requisicao (a partir da sessao + vinculo escolhido) e
 * passado explicitamente para os casos de uso. Os casos de uso nunca leem a
 * sessao diretamente: recebem este objeto. Isso torna as regras testaveis
 * sem Next.js nem Better Auth.
 */
export interface ContextoUsuario {
  readonly usuarioId: IdUsuario;
  readonly nomeUsuario: string;
  readonly organizacaoId: IdOrganizacao;
  readonly empresaId: IdEmpresa;
  readonly filialId?: IdFilial;
  readonly papel: Papel;
  /** Permissoes efetivas ja resolvidas (papel + extras - removidas). */
  readonly permissoes: ReadonlySet<Permissao>;
  /** Metadados usados pela auditoria. */
  readonly requisicao: {
    readonly id: string;
    readonly ip?: string;
    readonly agenteUsuario?: string;
  };
}

/**
 * Contexto do sistema para tarefas em segundo plano (sem usuario humano).
 * Tem todas as permissoes, mas a auditoria registra `origem: "tarefa"`.
 */
export interface ContextoSistema {
  readonly tipo: "sistema";
  readonly organizacaoId: IdOrganizacao;
  readonly empresaId: IdEmpresa;
  readonly motivo: string;
}
