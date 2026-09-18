import { comoIdentificador, type IdEmpresa, type IdOrganizacao, type IdUsuario } from "@/compartilhado/tipos/identificadores";
import type { EventoAuditoria } from "@/nucleo/auditoria/publico";
import type { Papel } from "@/nucleo/autorizacao/publico";

import type {
  EscritaInstalacaoEmpresa,
  LeitorAcessoEmpresas,
  UnidadeInstalacaoEmpresa,
} from "../aplicacao/repositorio-acesso-empresas";
import type { EmpresaAcessivel } from "../dominio/acesso-empresas";

interface OrganizacaoMemoria {
  id: IdOrganizacao;
  nome: string;
  ativa: boolean;
}

interface EmpresaMemoria {
  id: IdEmpresa;
  organizacaoId: IdOrganizacao;
  nome: string;
  nomeFantasia?: string;
  cnpj?: string;
  fusoHorario: string;
  ativa: boolean;
}

interface VinculoMemoria {
  usuarioId: IdUsuario;
  organizacaoId: IdOrganizacao;
  empresaId: IdEmpresa | null;
  papel: Papel;
  permissoesExtras: string[];
  permissoesRemovidas: string[];
  ativo: boolean;
}

/**
 * Implementacao em memoria dos contratos de acesso a empresas, para testes de
 * casos de uso e da resolucao de contexto.
 *
 * Reproduz o que importa do PostgreSQL: `executarAtomicamente` desfaz tudo se
 * a operacao lancar; a unicidade de vinculo por escopo e verificada.
 * NAO reproduz o lock: concorrencia real e testada em
 * `src/banco-dados/testes/acesso-empresas.teste.ts`.
 */
export class AcessoEmpresasEmMemoria implements LeitorAcessoEmpresas, UnidadeInstalacaoEmpresa {
  organizacoes: OrganizacaoMemoria[] = [];
  empresas: EmpresaMemoria[] = [];
  vinculos: VinculoMemoria[] = [];
  readonly auditoria: EventoAuditoria[] = [];
  private contador = 0;

  // ---- apoio para montar cenarios -------------------------------------

  criarEmpresaDeTeste(nome: string, opcoes: { organizacaoId?: IdOrganizacao; ativa?: boolean } = {}): EmpresaMemoria {
    const organizacaoId = opcoes.organizacaoId ?? this.criarOrganizacaoDeTeste(`Org ${nome}`).id;
    const empresa: EmpresaMemoria = {
      id: this.proximoId<"Empresa">("empresa"),
      organizacaoId,
      nome,
      fusoHorario: "America/Sao_Paulo",
      ativa: opcoes.ativa ?? true,
    };
    this.empresas.push(empresa);
    return empresa;
  }

  criarOrganizacaoDeTeste(nome: string): OrganizacaoMemoria {
    const organizacao: OrganizacaoMemoria = { id: this.proximoId<"Organizacao">("org"), nome, ativa: true };
    this.organizacoes.push(organizacao);
    return organizacao;
  }

  vincular(usuarioId: IdUsuario, empresa: EmpresaMemoria, papel: Papel = "financeiro"): VinculoMemoria {
    return this.inserirVinculo({ usuarioId, organizacaoId: empresa.organizacaoId, empresaId: empresa.id, papel });
  }

  vincularAOrganizacao(usuarioId: IdUsuario, organizacaoId: IdOrganizacao, papel: Papel = "financeiro"): VinculoMemoria {
    return this.inserirVinculo({ usuarioId, organizacaoId, empresaId: null, papel });
  }

  revogarVinculos(usuarioId: IdUsuario, empresaId?: IdEmpresa): void {
    for (const vinculo of this.vinculos) {
      if (vinculo.usuarioId === usuarioId && (empresaId === undefined || vinculo.empresaId === empresaId)) {
        vinculo.ativo = false;
      }
    }
  }

  // ---- LeitorAcessoEmpresas -------------------------------------------

  async listarEmpresasAcessiveis(usuarioId: IdUsuario): Promise<readonly EmpresaAcessivel[]> {
    const resultado = new Map<IdEmpresa, EmpresaAcessivel>();
    for (const vinculo of this.vinculos) {
      if (vinculo.usuarioId !== usuarioId || !vinculo.ativo) continue;
      const empresasDoVinculo = this.empresas.filter(
        (empresa) =>
          empresa.ativa &&
          empresa.organizacaoId === vinculo.organizacaoId &&
          (vinculo.empresaId === null || empresa.id === vinculo.empresaId),
      );
      for (const empresa of empresasDoVinculo) {
        // Vinculo direto com a empresa prevalece sobre o vinculo de organizacao.
        if (resultado.has(empresa.id) && vinculo.empresaId === null) continue;
        resultado.set(empresa.id, {
          empresaId: empresa.id,
          organizacaoId: empresa.organizacaoId,
          nome: empresa.nome,
          ...(empresa.nomeFantasia ? { nomeFantasia: empresa.nomeFantasia } : {}),
          fusoHorario: empresa.fusoHorario,
          papel: vinculo.papel,
          permissoesExtras: [...vinculo.permissoesExtras],
          permissoesRemovidas: [...vinculo.permissoesRemovidas],
          acessoPelaOrganizacao: vinculo.empresaId === null,
        });
      }
    }
    return [...resultado.values()];
  }

  // ---- UnidadeInstalacaoEmpresa ---------------------------------------

  async executarAtomicamente<T>(operacao: (escrita: EscritaInstalacaoEmpresa) => Promise<T>): Promise<T> {
    const antes = {
      organizacoes: structuredClone(this.organizacoes),
      empresas: structuredClone(this.empresas),
      vinculos: structuredClone(this.vinculos),
      auditoria: this.auditoria.length,
    };
    try {
      return await operacao(this.escrita());
    } catch (erro) {
      this.organizacoes = antes.organizacoes;
      this.empresas = antes.empresas;
      this.vinculos = antes.vinculos;
      this.auditoria.length = antes.auditoria;
      throw erro;
    }
  }

  private escrita(): EscritaInstalacaoEmpresa {
    return {
      travarUsuarioParaInstalacao: async () => undefined,
      contarVinculosAtivos: async (usuarioId) => this.vinculos.filter((v) => v.usuarioId === usuarioId && v.ativo).length,
      cnpjJaExiste: async (cnpj) => this.empresas.some((empresa) => empresa.cnpj === cnpj),
      criarOrganizacao: async ({ nome }) => this.criarOrganizacaoDeTeste(nome).id,
      criarEmpresa: async (dados) => {
        const empresa: EmpresaMemoria = {
          id: this.proximoId<"Empresa">("empresa"),
          organizacaoId: dados.organizacaoId,
          nome: dados.nome,
          ...(dados.nomeFantasia ? { nomeFantasia: dados.nomeFantasia } : {}),
          ...(dados.cnpj ? { cnpj: dados.cnpj } : {}),
          fusoHorario: "America/Sao_Paulo",
          ativa: true,
        };
        this.empresas.push(empresa);
        return empresa.id;
      },
      criarVinculo: async (dados) => {
        this.inserirVinculo(dados);
      },
      registrarAuditoria: async (evento) => {
        this.auditoria.push(evento);
      },
    };
  }

  private inserirVinculo(dados: {
    usuarioId: IdUsuario;
    organizacaoId: IdOrganizacao;
    empresaId: IdEmpresa | null;
    papel: Papel;
  }): VinculoMemoria {
    const duplicado = this.vinculos.some(
      (v) => v.usuarioId === dados.usuarioId && v.organizacaoId === dados.organizacaoId && v.empresaId === dados.empresaId,
    );
    if (duplicado) {
      throw new Error("unico_vinculos_usuario_escopo: vinculo duplicado.");
    }
    const vinculo: VinculoMemoria = { ...dados, permissoesExtras: [], permissoesRemovidas: [], ativo: true };
    this.vinculos.push(vinculo);
    return vinculo;
  }

  private proximoId<Marca extends string>(prefixo: string) {
    this.contador += 1;
    return comoIdentificador<Marca>(`${prefixo}-${this.contador}`);
  }
}
