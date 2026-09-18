import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

import type { ArmazenamentoArquivos, ArquivoGuardado, ArquivoParaGuardar } from "../armazenamento-arquivos";

/**
 * Armazenamento em disco local (Modelos B e C; tambem util em desenvolvimento).
 *
 * Estrutura: <raiz>/<empresa>/<aaaa>/<mm>/<uuid>.bin
 * - A chave devolvida e o caminho relativo; e ela que vai para `arquivos.chave_armazenamento`.
 * - O nome original NUNCA vira caminho (evita "../" e nomes maliciosos).
 * - A extensao tambem nao e usada: o tipo de conteudo fica no banco.
 *
 * O volume `arquivos` do docker-compose deve entrar no backup junto com o banco
 * (docs/modelo-dados/anexos.md).
 */
export class ArmazenamentoArquivosLocal implements ArmazenamentoArquivos {
  private readonly raiz: string;

  constructor(
    raiz: string,
    private readonly empresaId: string,
  ) {
    this.raiz = resolve(raiz);
  }

  async guardar(arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado> {
    const agora = new Date();
    const ano = String(agora.getUTCFullYear());
    const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
    const chave = join(this.empresaId, ano, mes, `${crypto.randomUUID()}.bin`);
    const caminho = this.caminhoSeguro(chave);
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, arquivo.conteudo, { flag: "wx" });
    return {
      chave,
      tamanhoBytes: arquivo.conteudo.byteLength,
      impressaoDigital: createHash("sha256").update(arquivo.conteudo).digest("hex"),
    };
  }

  async obter(chave: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.caminhoSeguro(chave)));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw erro;
    }
  }

  async remover(chave: string): Promise<void> {
    await rm(this.caminhoSeguro(chave), { force: true });
  }

  /** Garante que a chave nao escapa da raiz (protecao contra "../"). */
  private caminhoSeguro(chave: string): string {
    const caminho = resolve(this.raiz, normalize(chave));
    if (!caminho.startsWith(this.raiz + "/") ) {
      throw new Error("Chave de armazenamento invalida.");
    }
    return caminho;
  }
}
