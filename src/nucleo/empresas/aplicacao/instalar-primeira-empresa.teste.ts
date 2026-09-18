import { describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";

import { AcessoEmpresasEmMemoria } from "../infraestrutura/acesso-empresas-em-memoria";
import type { EscritaInstalacaoEmpresa, UnidadeInstalacaoEmpresa } from "./repositorio-acesso-empresas";
import { instalarPrimeiraEmpresa, PAPEL_DO_INSTALADOR } from "./instalar-primeira-empresa";

const usuarioA = comoIdentificador<"Usuario">("usuario-a");
const quemA = { usuarioId: usuarioA, origem: "interface" as const, requisicaoId: "req-1" };

describe("instalarPrimeiraEmpresa", () => {
  it("cria organizacao, empresa e vinculo de administrador, e registra auditoria", async () => {
    const acesso = new AcessoEmpresasEmMemoria();

    const resultado = await instalarPrimeiraEmpresa(acesso, quemA, { nome: "Padaria São Jorge", cnpj: "11.222.333/0001-81" });

    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;
    expect(acesso.organizacoes).toHaveLength(1);
    expect(acesso.empresas).toHaveLength(1);
    expect(acesso.empresas[0]).toMatchObject({ nome: "Padaria São Jorge", cnpj: "11222333000181", organizacaoId: resultado.valor.organizacaoId });
    expect(acesso.vinculos).toEqual([
      expect.objectContaining({ usuarioId: usuarioA, empresaId: resultado.valor.empresaId, papel: PAPEL_DO_INSTALADOR, ativo: true }),
    ]);
    expect(acesso.auditoria).toEqual([
      expect.objectContaining({ acao: "empresa.instalada", empresaId: resultado.valor.empresaId, usuarioId: usuarioA, requisicaoId: "req-1" }),
    ]);

    const acessiveis = await acesso.listarEmpresasAcessiveis(usuarioA);
    expect(acessiveis.map((e) => [e.empresaId, e.papel])).toEqual([[resultado.valor.empresaId, "administrador"]]);
  });

  it("recusa quem ja tem empresa (replay do instalador) sem criar nada", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    await instalarPrimeiraEmpresa(acesso, quemA, { nome: "Primeira" });

    const segunda = await instalarPrimeiraEmpresa(acesso, quemA, { nome: "Segunda" });

    expect(segunda.sucesso).toBe(false);
    if (segunda.sucesso) return;
    expect(segunda.erro.codigo).toBe("usuario_ja_possui_empresa");
    expect(acesso.empresas).toHaveLength(1);
    expect(acesso.vinculos).toHaveLength(1);
  });

  it("recusa tambem quem tem vinculo com empresa criada por outra pessoa", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    const empresaDeB = acesso.criarEmpresaDeTeste("Empresa de B");
    acesso.vincular(usuarioA, empresaDeB, "somente_leitura");

    const resultado = await instalarPrimeiraEmpresa(acesso, quemA, { nome: "Minha" });

    expect(resultado.sucesso).toBe(false);
    expect(acesso.empresas).toHaveLength(1);
  });

  it("valida a entrada: nome obrigatorio e CNPJ com digito verificador", async () => {
    const acesso = new AcessoEmpresasEmMemoria();

    const resultado = await instalarPrimeiraEmpresa(acesso, quemA, { nome: "   ", cnpj: "11.222.333/0001-00" });

    expect(resultado.sucesso).toBe(false);
    if (resultado.sucesso) return;
    expect(resultado.erro.codigo).toBe("validacao");
    expect(resultado.erro.detalhes).toEqual({ campos: { nome: ["Campo obrigatorio."], cnpj: ["CNPJ invalido."] } });
    expect(acesso.empresas).toHaveLength(0);
    expect(acesso.vinculos).toHaveLength(0);
  });

  it("CNPJ vazio e tratado como ausente; CNPJ ja usado e recusado", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    const semCnpj = await instalarPrimeiraEmpresa(acesso, quemA, { nome: "Sem CNPJ", cnpj: "" });
    expect(semCnpj.sucesso).toBe(true);
    expect(acesso.empresas[0]?.cnpj).toBeUndefined();

    const usuarioB = comoIdentificador<"Usuario">("usuario-b");
    const primeira = await instalarPrimeiraEmpresa(acesso, { usuarioId: usuarioB, origem: "interface" }, { nome: "Com CNPJ", cnpj: "11222333000181" });
    expect(primeira.sucesso).toBe(true);

    const usuarioC = comoIdentificador<"Usuario">("usuario-c");
    const repetido = await instalarPrimeiraEmpresa(acesso, { usuarioId: usuarioC, origem: "interface" }, { nome: "Outra", cnpj: "11222333000181" });
    expect(repetido.sucesso).toBe(false);
    if (repetido.sucesso) return;
    expect(repetido.erro.codigo).toBe("cnpj_ja_cadastrado");
    expect(acesso.empresas).toHaveLength(2);
  });

  it("falha no meio da instalacao nao deixa nada gravado (tudo ou nada)", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    // Simula falha tecnica no ultimo passo (auditoria), depois de empresa e vinculo ja "gravados".
    const unidadeComFalha: UnidadeInstalacaoEmpresa = {
      executarAtomicamente: (operacao) =>
        acesso.executarAtomicamente((escrita) => {
          const escritaComFalha: EscritaInstalacaoEmpresa = {
            ...escrita,
            registrarAuditoria: async () => {
              throw new Error("banco indisponivel");
            },
          };
          return operacao(escritaComFalha);
        }),
    };

    await expect(instalarPrimeiraEmpresa(unidadeComFalha, quemA, { nome: "Nao deve existir" })).rejects.toThrow("banco indisponivel");

    expect(acesso.organizacoes).toHaveLength(0);
    expect(acesso.empresas).toHaveLength(0);
    expect(acesso.vinculos).toHaveLength(0);
    expect(acesso.auditoria).toHaveLength(0);
    expect(await acesso.listarEmpresasAcessiveis(usuarioA)).toEqual([]);
  });
});
