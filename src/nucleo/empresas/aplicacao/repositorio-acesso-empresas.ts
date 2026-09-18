import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";
import type { EventoAuditoria } from "@/nucleo/auditoria/publico";
import type { Papel } from "@/nucleo/autorizacao/publico";

import type { EmpresaAcessivel } from "../dominio/acesso-empresas";

/**
 * Contratos que os casos de uso de acesso a empresas precisam.
 *
 * A implementacao real e Drizzle (`infraestrutura/`); a de testes e em
 * memoria. Os casos de uso nao conhecem nenhuma das duas.
 */

/** Leitura: quais empresas um usuario pode usar. */
export interface LeitorAcessoEmpresas {
  /**
   * Empresas acessiveis por vinculos ATIVOS do usuario, com empresa ATIVA.
   * Vinculo com `empresaId` nulo expande para todas as empresas ativas da
   * organizacao. Ordem indefinida; quem precisa de ordem, ordena.
   */
  listarEmpresasAcessiveis(usuarioId: IdUsuario): Promise<readonly EmpresaAcessivel[]>;
}

/** Escrita disponivel DENTRO de uma unidade atomica de instalacao. */
export interface EscritaInstalacaoEmpresa {
  /**
   * Serializa instalacoes do mesmo usuario: enquanto uma transacao segura o
   * lock, outra com o mesmo usuario espera. Sem isso, dois pedidos simultaneos
   * poderiam ambos ver "zero vinculos" e criar duas empresas.
   */
  travarUsuarioParaInstalacao(usuarioId: IdUsuario): Promise<void>;
  contarVinculosAtivos(usuarioId: IdUsuario): Promise<number>;
  cnpjJaExiste(cnpj: string): Promise<boolean>;
  criarOrganizacao(dados: { nome: string }): Promise<IdOrganizacao>;
  criarEmpresa(dados: {
    organizacaoId: IdOrganizacao;
    nome: string;
    nomeFantasia?: string;
    cnpj?: string;
  }): Promise<IdEmpresa>;
  criarVinculo(dados: { usuarioId: IdUsuario; organizacaoId: IdOrganizacao; empresaId: IdEmpresa; papel: Papel }): Promise<void>;
  registrarAuditoria(evento: EventoAuditoria): Promise<void>;
}

/** Abre a unidade atomica: ou tudo dentro de `operacao` e gravado, ou nada. */
export interface UnidadeInstalacaoEmpresa {
  executarAtomicamente<T>(operacao: (escrita: EscritaInstalacaoEmpresa) => Promise<T>): Promise<T>;
}
