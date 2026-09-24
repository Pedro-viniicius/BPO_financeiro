import { describe, expect, it } from "vitest";

import { EnvioRecusado, FORMATO_PROTOCOLO, MAXIMO_ARQUIVOS_POR_ENVIO, validarEnvio } from "./envio";

const jpg = (tamanhoBytes: number) => ({ tamanhoBytes, tipoConteudo: "image/jpeg" });

function motivo(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (erro) {
    return erro instanceof EnvioRecusado ? erro.motivo : "outro";
  }
}

describe("regras do envio publico", () => {
  it("aceita ate 10 arquivos permitidos, dentro dos tamanhos", () => {
    expect(motivo(() => validarEnvio([jpg(1000), { tamanhoBytes: 1000, tipoConteudo: "application/pdf" }], "ok"))).toBeNull();
    expect(motivo(() => validarEnvio(Array.from({ length: MAXIMO_ARQUIVOS_POR_ENVIO }, () => jpg(1)), null))).toBeNull();
  });

  it("recusa, nesta ordem: nada, demais, tipo, arquivo grande, envio grande, observacao longa", () => {
    expect(motivo(() => validarEnvio([], null))).toBe("sem_arquivos");
    expect(motivo(() => validarEnvio(Array.from({ length: 11 }, () => jpg(1)), null))).toBe("arquivos_demais");
    expect(motivo(() => validarEnvio([{ tamanhoBytes: 10, tipoConteudo: "image/gif" }], null))).toBe("tipo_nao_permitido");
    expect(motivo(() => validarEnvio([{ tamanhoBytes: 10, tipoConteudo: "application/x-msdownload" }], null))).toBe("tipo_nao_permitido");
    expect(motivo(() => validarEnvio([jpg(15 * 1024 * 1024 + 1)], null))).toBe("arquivo_grande");
    expect(motivo(() => validarEnvio([jpg(14 * 1024 * 1024), jpg(14 * 1024 * 1024), jpg(14 * 1024 * 1024)], null))).toBe("envio_grande");
    expect(motivo(() => validarEnvio([jpg(1)], "x".repeat(501)))).toBe("observacao_longa");
  });

  it("a mensagem diz o que fazer, em portugues, sem termo interno", () => {
    expect(new EnvioRecusado("arquivo_grande").message).toMatch(/15 MB/);
    expect(new EnvioRecusado("tipo_nao_permitido").message).toBe("Só são aceitos JPG, PNG e PDF.");
  });

  it("so um protocolo no formato DC-AAAA-NNNNNN volta para a tela publica", () => {
    expect(FORMATO_PROTOCOLO.test("DC-2026-000123")).toBe(true);
    expect(FORMATO_PROTOCOLO.test("DC-2026-000123<script>")).toBe(false);
    expect(FORMATO_PROTOCOLO.test("CP-2026-000123")).toBe(false);
  });
});
