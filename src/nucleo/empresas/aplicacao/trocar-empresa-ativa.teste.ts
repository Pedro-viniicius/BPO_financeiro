import { describe, expect, it } from "vitest";

import { comoIdentificador } from "@/compartilhado/tipos/identificadores";

import { resolverEmpresaAtiva } from "../dominio/acesso-empresas";
import { AcessoEmpresasEmMemoria } from "../infraestrutura/acesso-empresas-em-memoria";
import { trocarEmpresaAtiva } from "./trocar-empresa-ativa";

const usuarioA = comoIdentificador<"Usuario">("usuario-a");
const usuarioB = comoIdentificador<"Usuario">("usuario-b");

function cenarioAB() {
  const acesso = new AcessoEmpresasEmMemoria();
  const empresaA = acesso.criarEmpresaDeTeste("Empresa A");
  const empresaB = acesso.criarEmpresaDeTeste("Empresa B");
  acesso.vincular(usuarioA, empresaA, "administrador");
  acesso.vincular(usuarioB, empresaB, "administrador");
  return { acesso, empresaA, empresaB };
}

describe("isolamento entre empresas", () => {
  it("usuario A so enxerga a Empresa A; usuario B so enxerga a Empresa B", async () => {
    const { acesso, empresaA, empresaB } = cenarioAB();
    expect((await acesso.listarEmpresasAcessiveis(usuarioA)).map((e) => e.empresaId)).toEqual([empresaA.id]);
    expect((await acesso.listarEmpresasAcessiveis(usuarioB)).map((e) => e.empresaId)).toEqual([empresaB.id]);
  });

  it("A tenta ativar a Empresa B (id manipulado no formulario): recusado, sem vazar nada", async () => {
    const { acesso, empresaB } = cenarioAB();

    const resultado = await trocarEmpresaAtiva(acesso, usuarioA, empresaB.id);

    expect(resultado.sucesso).toBe(false);
    if (resultado.sucesso) return;
    expect(resultado.erro.codigo).toBe("usuario_sem_acesso_a_empresa");
    // A mensagem nao confirma se a empresa existe.
    expect(resultado.erro.message).not.toContain("Empresa B");
  });

  it("cookie de A apontando para a Empresa B nao a torna ativa", async () => {
    const { acesso, empresaA, empresaB } = cenarioAB();
    const ativa = resolverEmpresaAtiva(await acesso.listarEmpresasAcessiveis(usuarioA), empresaB.id);
    expect(ativa?.empresaId).toBe(empresaA.id);
  });

  it("id inexistente ou vazio tambem e recusado", async () => {
    const { acesso } = cenarioAB();
    expect((await trocarEmpresaAtiva(acesso, usuarioA, "nao-existe")).sucesso).toBe(false);
    expect((await trocarEmpresaAtiva(acesso, usuarioA, "")).sucesso).toBe(false);
  });
});

describe("troca de empresa ativa", () => {
  it("quem pertence a A e B troca de A para B, e o contexto passa a refletir B", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    const empresaA = acesso.criarEmpresaDeTeste("Empresa A");
    const empresaB = acesso.criarEmpresaDeTeste("Empresa B");
    acesso.vincular(usuarioA, empresaA, "administrador");
    acesso.vincular(usuarioA, empresaB, "financeiro");

    const troca = await trocarEmpresaAtiva(acesso, usuarioA, empresaB.id);
    expect(troca.sucesso).toBe(true);
    if (!troca.sucesso) return;
    expect(troca.valor).toMatchObject({ empresaId: empresaB.id, papel: "financeiro" });

    // O que a proxima requisicao faz com a preferencia gravada:
    const ativa = resolverEmpresaAtiva(await acesso.listarEmpresasAcessiveis(usuarioA), troca.valor.empresaId);
    expect(ativa?.empresaId).toBe(empresaB.id);
    expect(ativa?.papel).toBe("financeiro");
  });

  it("vinculo revogado: a preferencia antiga nao concede mais acesso", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    const empresaA = acesso.criarEmpresaDeTeste("Empresa A");
    const empresaB = acesso.criarEmpresaDeTeste("Empresa B");
    acesso.vincular(usuarioA, empresaA);
    acesso.vincular(usuarioA, empresaB);
    const preferenciaAntiga = empresaA.id;

    acesso.revogarVinculos(usuarioA, empresaA.id);

    const acessiveis = await acesso.listarEmpresasAcessiveis(usuarioA);
    expect(acessiveis.map((e) => e.empresaId)).toEqual([empresaB.id]);
    expect(resolverEmpresaAtiva(acessiveis, preferenciaAntiga)?.empresaId).toBe(empresaB.id);
    expect((await trocarEmpresaAtiva(acesso, usuarioA, preferenciaAntiga)).sucesso).toBe(false);
  });

  it("todos os vinculos revogados: usuario volta ao estado 'sem empresa'", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    const empresaA = acesso.criarEmpresaDeTeste("Empresa A");
    acesso.vincular(usuarioA, empresaA);
    acesso.revogarVinculos(usuarioA);

    expect(resolverEmpresaAtiva(await acesso.listarEmpresasAcessiveis(usuarioA), empresaA.id)).toBeNull();
  });

  it("vinculo 'toda a organizacao' da acesso a todas as empresas ativas do grupo, e so a elas", async () => {
    const acesso = new AcessoEmpresasEmMemoria();
    const grupo = acesso.criarOrganizacaoDeTeste("Grupo Silva");
    const padaria = acesso.criarEmpresaDeTeste("Padaria Silva", { organizacaoId: grupo.id });
    const distribuidora = acesso.criarEmpresaDeTeste("Silva Distribuidora", { organizacaoId: grupo.id });
    acesso.criarEmpresaDeTeste("Silva Inativa", { organizacaoId: grupo.id, ativa: false });
    acesso.criarEmpresaDeTeste("Outro Grupo Ltda");
    acesso.vincularAOrganizacao(usuarioA, grupo.id, "controladoria");

    const acessiveis = await acesso.listarEmpresasAcessiveis(usuarioA);

    expect(acessiveis.map((e) => e.empresaId).sort()).toEqual([padaria.id, distribuidora.id].sort());
    expect(acessiveis.every((e) => e.papel === "controladoria" && e.acessoPelaOrganizacao)).toBe(true);
  });
});
