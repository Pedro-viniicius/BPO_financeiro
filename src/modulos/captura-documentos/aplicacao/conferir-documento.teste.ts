import { describe, expect, it } from "vitest";

import type { DataCivil, DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";

import { DocumentoNaoEncontrado, DocumentoNaoPendente, DocumentoNaoReabrivel, MotivoDeRejeicaoInvalido } from "../dominio/conferencia";
import { abrirDocumento, aprovarDocumento, reabrirDocumento, rejeitarDocumento } from "./conferir-documento";
import { documentoPendente, escopoDeTeste, RepositorioCapturaEmMemoria } from "./testes/repositorio-captura-em-memoria";

const escopo = escopoDeTeste;
const d = (t: string) => t as DataCivil;
const entrada = {
  descricao: "Nota do fornecedor X",
  fornecedorId: "forn-1",
  categoriaId: "cat-1",
  valorTotal: Dinheiro.deTexto("1234.56"),
  dataVencimento: d("2026-10-10") as DataVencimento,
  dataCompetencia: d("2026-09-30"),
  chaveAcesso: null,
};

function montar() {
  const repositorio = new RepositorioCapturaEmMemoria();
  repositorio.documentos.set("1", documentoPendente("1"));
  return { repositorio, dependencias: { repositorio } };
}

describe("aprovar documento", () => {
  it("cria a conta com UMA parcela igual ao total, no estado inicial, e congela o marco de retencao", async () => {
    const { repositorio, dependencias } = montar();
    const resultado = await aprovarDocumento(dependencias, escopo, "1", entrada, "u1");
    expect(resultado).toEqual({ tituloId: "titulo-1", parcelaId: "parcela-1" });

    const { dados } = repositorio.aprovacoes[0]!;
    expect(dados.conta.parcelas).toEqual([{ numero: 1, dataVencimento: "2026-10-10", valor: entrada.valorTotal }]);
    expect(dados.conta.valorTotal.paraTexto()).toBe("1234.56");
    expect(dados.conta.fornecedorId).toBe("forn-1");
    // Competencia set/2026, envio set/2026 -> 1/1/2027 + 5 anos.
    expect(dados.dataMarcoRetencao).toBe("2032-01-01");
    expect(repositorio.documentos.get("1")?.situacao).toBe("aprovado");
  });

  it("uma data extraida do documento mais tardia que a competencia empurra o marco", async () => {
    const { repositorio, dependencias } = montar();
    await aprovarDocumento(dependencias, escopo, "1", { ...entrada, datasDoDocumento: [d("2027-02-01")] }, "u1");
    expect(repositorio.aprovacoes[0]!.dados.dataMarcoRetencao).toBe("2033-01-01");
  });

  it("nao aprova o que nao esta pendente nem o que nao existe", async () => {
    const { repositorio, dependencias } = montar();
    await aprovarDocumento(dependencias, escopo, "1", entrada, "u1");
    await expect(aprovarDocumento(dependencias, escopo, "1", entrada, "u1")).rejects.toBeInstanceOf(DocumentoNaoPendente);
    await expect(aprovarDocumento(dependencias, escopo, "99", entrada, "u1")).rejects.toBeInstanceOf(DocumentoNaoEncontrado);
    expect(repositorio.aprovacoes).toHaveLength(1);
  });
});

describe("rejeitar e reabrir", () => {
  it("rejeitar exige motivo e marca 90 dias a partir de hoje", async () => {
    const { repositorio, dependencias } = montar();
    await expect(rejeitarDocumento(dependencias, escopo, "1", "", "u1", d("2026-09-24"))).rejects.toBeInstanceOf(MotivoDeRejeicaoInvalido);
    await rejeitarDocumento(dependencias, escopo, "1", " ilegível, tire outra foto ", "u1", d("2026-09-24"));
    expect(repositorio.rejeicoes[0]).toEqual({ documentoId: "1", motivo: "ilegível, tire outra foto", dataMarcoRetencao: "2026-12-23" });
    expect(repositorio.documentos.get("1")?.situacao).toBe("rejeitado");
  });

  it("reabrir volta um rejeitado para a fila; aprovado nao volta", async () => {
    const { repositorio, dependencias } = montar();
    await rejeitarDocumento(dependencias, escopo, "1", "motivo qualquer", "u1", d("2026-09-24"));
    await reabrirDocumento(dependencias, escopo, "1", "u2");
    expect(repositorio.documentos.get("1")?.situacao).toBe("pendente_conferencia");
    expect(repositorio.reaberturas).toEqual(["1"]);

    await aprovarDocumento(dependencias, escopo, "1", entrada, "u1");
    await expect(reabrirDocumento(dependencias, escopo, "1", "u2")).rejects.toBeInstanceOf(DocumentoNaoReabrivel);
  });

  it("abrir um documento mostra se ha OUTRO da mesma empresa com a mesma chave — aviso, nao bloqueio", async () => {
    const { repositorio, dependencias } = montar();
    const chave = "35260912345678000190550010000012341123456789";
    repositorio.documentos.set("1", documentoPendente("1", { chaveAcesso: chave }));
    repositorio.documentos.set("2", documentoPendente("2", { chaveAcesso: chave }));
    const aberto = await abrirDocumento(dependencias, escopo, "2");
    expect(aberto.duplicadoDe).toEqual({ id: "1", codigo: "DC-2026-000001" });
    await expect(abrirDocumento(dependencias, escopo, "99")).rejects.toBeInstanceOf(DocumentoNaoEncontrado);
  });
});
