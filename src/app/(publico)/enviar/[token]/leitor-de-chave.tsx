"use client";

import { useEffect, useState } from "react";

import { extrairChaveDeTexto } from "@/compartilhado/fiscal/indice";

import estilos from "./envio.module.css";

/**
 * Melhoria progressiva (ADR-029): onde o navegador tem `BarcodeDetector`
 * (Chrome no Android), a chave e lida da IMAGEM JA ESCOLHIDA — nunca por
 * `getUserMedia` — e preenche o campo. QR da NFC-e (a chave vem DENTRO da
 * URL) e codigo de barras CODE-128 do DANFE. Onde nao ha suporte, ou se a
 * leitura falhar, o campo continua la para digitar. Nada e enviado antes de a
 * pessoa apertar "Enviar", e a chave preenchida e validada no servidor.
 */
interface DetectorDeCodigo {
  detect(imagem: ImageBitmapSource): Promise<readonly { readonly rawValue: string }[]>;
}
interface JanelaComDetector extends Window {
  BarcodeDetector?: new (opcoes: { formats: string[] }) => DetectorDeCodigo;
}

export function LeitorDeChave({ campoChaveId, camposDeArquivo }: { readonly campoChaveId: string; readonly camposDeArquivo: readonly string[] }) {
  const [lida, definirLida] = useState<string | null>(null);

  useEffect(() => {
    const Detector = (window as JanelaComDetector).BarcodeDetector;
    const elemento = document.getElementById(campoChaveId);
    if (!Detector || !(elemento instanceof HTMLInputElement)) return;
    const campoChave: HTMLInputElement = elemento;
    const detector = new Detector({ formats: ["qr_code", "code_128"] });

    async function lerDe(campo: HTMLInputElement) {
      if (campoChave.value.trim() !== "") return; // nunca sobrescreve o que a pessoa digitou
      for (const arquivo of campo.files ?? []) {
        if (!arquivo.type.startsWith("image/")) continue;
        try {
          const imagem = await createImageBitmap(arquivo);
          const codigos = await detector.detect(imagem);
          imagem.close();
          for (const codigo of codigos) {
            const chave = extrairChaveDeTexto(codigo.rawValue);
            if (chave) {
              campoChave.value = chave;
              definirLida(chave);
              return;
            }
          }
        } catch {
          /* Foto sem codigo legivel: segue para a proxima; o campo fica para digitar. */
        }
      }
    }

    const campos = camposDeArquivo
      .map((nome) => document.getElementsByName(nome)[0])
      .filter((c): c is HTMLInputElement => c instanceof HTMLInputElement);
    const ouvintes = campos.map((campo) => {
      const ouvinte = () => void lerDe(campo);
      campo.addEventListener("change", ouvinte);
      return () => campo.removeEventListener("change", ouvinte);
    });
    return () => ouvintes.forEach((remover) => remover());
  }, [campoChaveId, camposDeArquivo]);

  return lida ? <p className={estilos.lida} role="status">Chave lida da foto: {lida}. Confira antes de enviar.</p> : null;
}
