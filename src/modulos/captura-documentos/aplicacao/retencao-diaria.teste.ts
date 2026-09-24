import { describe, expect, it } from "vitest";

import type { DataCivil } from "@/compartilhado/datas/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

import { executarRetencaoDiaria, pedidoDeRetencaoDiaria, TIPO_TAREFA_RETENCAO } from "./retencao-diaria";
import { escopoDeTeste, RepositorioCapturaEmMemoria } from "./testes/repositorio-captura-em-memoria";

class RepositorioComRetencao extends RepositorioCapturaEmMemoria {
  chamadas: string[] = [];
  chaves = ["emp-1/2025/01/a.bin", "emp-1/2025/01/b.bin"];
  override async listarEscoposComDocumentos() {
    return [escopoDeTeste];
  }
  override async arquivarAbandonados(_e: EscopoEmpresa, limite: Date, marcoDe: (d: DataCivil) => DataCivil) {
    this.chamadas.push(`arquivar<${limite.toISOString()}`);
    expect(marcoDe("2026-02-28" as DataCivil)).toBe("2027-02-28");
    return ["DC-2026-000001"];
  }
  override async expurgarVencidos(_e: EscopoEmpresa, hoje: DataCivil) {
    this.chamadas.push(`expurgar<=${hoje}`);
    return { documentos: ["DC-2025-000003", "DC-2025-000004"], chavesParaRemover: this.chaves };
  }
  override async limparTentativas(antesDe: Date) {
    this.chamadas.push(`tentativas<${antesDe.toISOString()}`);
    return 7;
  }
}

describe("retencao diaria", () => {
  it("arquiva abandonados (90 dias), expurga vencidos ate hoje, remove o conteudo DEPOIS e limpa tentativas (2 dias)", async () => {
    const repositorio = new RepositorioComRetencao();
    const removidas: string[] = [];
    const mensagens: string[] = [];
    const resultado = await executarRetencaoDiaria({
      repositorio,
      armazenamentoDe: () => ({ guardar: async () => { throw new Error("nao usado"); }, obter: async () => null, remover: async (chave) => { removidas.push(chave); } }),
      registrar: (m) => mensagens.push(m),
      agora: () => new Date("2026-09-24T15:00:00Z"),
    });
    expect(repositorio.chamadas).toEqual([
      "arquivar<2026-06-26T15:00:00.000Z",
      "expurgar<=2026-09-24",
      "tentativas<2026-09-22T15:00:00.000Z",
    ]);
    expect(removidas).toEqual(repositorio.chaves);
    expect(resultado).toEqual({ arquivados: 1, expurgados: 2, arquivosRemovidos: 2, tentativasApagadas: 7 });
    expect(mensagens).toContain("retencao executada para a empresa");
  });

  it("falha ao remover um arquivo nao derruba a rodada: fica registrada e os outros seguem", async () => {
    const repositorio = new RepositorioComRetencao();
    const mensagens: string[] = [];
    const resultado = await executarRetencaoDiaria({
      repositorio,
      armazenamentoDe: () => ({
        guardar: async () => { throw new Error("nao usado"); },
        obter: async () => null,
        remover: async (chave) => { if (chave.endsWith("a.bin")) throw new Error("disco"); },
      }),
      registrar: (m) => mensagens.push(m),
    });
    expect(resultado.arquivosRemovidos).toBe(1);
    expect(mensagens.some((m) => m.includes("falha ao remover"))).toBe(true);
  });

  it("o pedido diario e idempotente pelo dia", () => {
    const pedido = pedidoDeRetencaoDiaria("2026-09-24" as DataCivil);
    expect(pedido.tipo).toBe(TIPO_TAREFA_RETENCAO);
    expect(pedido.chaveIdempotencia).toBe("captura.retencao_diaria:2026-09-24");
  });
});
