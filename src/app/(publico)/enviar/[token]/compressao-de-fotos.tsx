"use client";

import { useEffect } from "react";

/** Lado maior depois da compressao. 2000 px le qualquer nota; uma foto de 12 MP tem 4000. */
const LADO_MAIOR_PX = 2000;
const QUALIDADE_JPEG = 0.85;
/** Abaixo disto nao vale o trabalho: a foto ja e pequena. */
const A_PARTIR_DE_BYTES = 1024 * 1024;

/**
 * Melhoria progressiva: com JavaScript, as fotos sao recomprimidas no
 * navegador antes de subir — lado maior em ~2000 px, JPEG. Isso alivia a
 * conexao (3G, sinal fraco) e, como o canvas reencoda a imagem, remove os
 * metadados EXIF, inclusive o GPS de onde a foto foi tirada.
 *
 * Sem JavaScript, ou se qualquer passo falhar, vai o original — e o servidor
 * nao muda de comportamento por causa disso: os limites sao os mesmos.
 *
 * So imagens sao tocadas; PDF passa intacto. Nao renderiza nada.
 */
export function CompressaoDeFotos({ formularioId }: { readonly formularioId: string }) {
  useEffect(() => {
    const elemento = document.getElementById(formularioId);
    if (!(elemento instanceof HTMLFormElement) || typeof DataTransfer === "undefined") return;
    const formulario: HTMLFormElement = elemento;
    let jaComprimido = false;

    async function comprimir(arquivo: File): Promise<File> {
      if (!arquivo.type.startsWith("image/") || arquivo.size < A_PARTIR_DE_BYTES) return arquivo;
      const imagem = await createImageBitmap(arquivo);
      const escala = Math.min(1, LADO_MAIOR_PX / Math.max(imagem.width, imagem.height));
      const tela = document.createElement("canvas");
      tela.width = Math.round(imagem.width * escala);
      tela.height = Math.round(imagem.height * escala);
      tela.getContext("2d")?.drawImage(imagem, 0, 0, tela.width, tela.height);
      imagem.close();
      const blob = await new Promise<Blob | null>((resolver) => tela.toBlob(resolver, "image/jpeg", QUALIDADE_JPEG));
      if (!blob || blob.size >= arquivo.size) return arquivo;
      return new File([blob], arquivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }

    async function aoEnviar(evento: SubmitEvent) {
      if (jaComprimido) return;
      const campos = [...formulario.querySelectorAll<HTMLInputElement>('input[type="file"]')];
      const temImagemGrande = campos.some((campo) => [...(campo.files ?? [])].some((f) => f.type.startsWith("image/") && f.size >= A_PARTIR_DE_BYTES));
      if (!temImagemGrande) return;
      evento.preventDefault();
      try {
        for (const campo of campos) {
          const transferencia = new DataTransfer();
          for (const arquivo of campo.files ?? []) transferencia.items.add(await comprimir(arquivo));
          campo.files = transferencia.files;
        }
      } catch {
        /* Qualquer falha: segue com os originais. */
      }
      jaComprimido = true;
      formulario.requestSubmit();
    }

    formulario.addEventListener("submit", aoEnviar);
    return () => formulario.removeEventListener("submit", aoEnviar);
  }, [formularioId]);

  return null;
}
