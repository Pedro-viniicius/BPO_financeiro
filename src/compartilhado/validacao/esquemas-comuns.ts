import { z } from "zod";

import { dataCivilDeTexto, ehDataCivil } from "@/compartilhado/datas/data-civil";
import { Dinheiro } from "@/compartilhado/dinheiro/dinheiro";

import { validarCnpj, validarCpf } from "./documentos-brasileiros";

/**
 * Esquemas Zod reutilizaveis. "Esquema" aqui e a descricao de formato usada
 * para validar dados que entram no sistema (formularios, APIs, importacoes).
 * As mensagens sao em portugues porque chegam ao usuario.
 */

export const esquemaIdentificador = z.uuid({ message: "Identificador inválido." });

/** Valor monetario em texto canonico ("1234.56"). Converte para `Dinheiro`. */
export const esquemaDinheiro = z
  .string({ message: "Informe um valor." })
  .regex(/^-?\d+(\.\d{1,2})?$/, "Valor inválido. Use o formato 1234.56.")
  .transform((texto) => Dinheiro.deTexto(texto));

/** Valor monetario digitado no formato brasileiro ("1.234,56"). */
export const esquemaDinheiroBrasileiro = z
  .string({ message: "Informe um valor." })
  .min(1, "Informe um valor.")
  .transform((texto, contexto) => {
    try {
      return Dinheiro.deTextoBrasileiro(texto);
    } catch {
      contexto.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 1.234,56." });
      return z.NEVER;
    }
  });

/** Data civil "AAAA-MM-DD". */
export const esquemaDataCivil = z
  .string({ message: "Informe uma data." })
  .refine(ehDataCivil, "Data inválida. Use o formato AAAA-MM-DD.")
  .transform((texto) => dataCivilDeTexto(texto));

export const esquemaCpf = z.string().refine(validarCpf, "CPF inválido.");
export const esquemaCnpj = z.string().refine(validarCnpj, "CNPJ inválido.");
export const esquemaCpfOuCnpj = z
  .string()
  .refine((texto) => validarCpf(texto) || validarCnpj(texto), "CPF ou CNPJ inválido.");

export const esquemaEmail = z.email({ message: "E-mail inválido." });

/** Texto curto obrigatorio (nomes, descricoes). Remove espacos nas pontas. */
export const esquemaTextoCurto = z.string().trim().min(1, "Campo obrigatório.").max(200, "Máximo de 200 caracteres.");

/** Parametros de paginacao vindos da interface. */
export const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce.number().int().min(1).max(200).default(50),
});
