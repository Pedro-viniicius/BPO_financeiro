import { criarDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Chave de acesso da NF-e / NFC-e: 44 posicoes que JA CONTEM, por posicao,
 * o que o OCR teria de adivinhar — UF, ano-mes de emissao, CNPJ do
 * emitente, modelo, serie e numero —, com digito verificador modulo 11.
 * Parsing deterministico, sem dependencia (ADR-029/030). O que a chave NAO
 * traz e o valor total: esse a equipe digita na conferencia.
 *
 * Layout (posicoes 0-based):
 *   0-1   cUF        codigo IBGE da UF
 *   2-5   AAMM       ano e mes de emissao
 *   6-19  CNPJ       desde a NT 2025.001 as 12 primeiras posicoes podem ser
 *                    alfanumericas; as 2 ultimas (DV do CNPJ) seguem numericas
 *   20-21 modelo     55 = NF-e, 65 = NFC-e
 *   22-24 serie
 *   25-33 numero
 *   34    tpEmis
 *   35-42 cNF        codigo numerico
 *   43    cDV        modulo 11 sobre as 43 anteriores, pesos 2..9 da direita
 *                    para a esquerda, cada caractere valendo ASCII − 48 —
 *                    e por isso que "A" vale 17, e nao 10.
 */
export const FORMATO_CHAVE_DE_ACESSO = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/;

const UFS: Readonly<Record<string, string>> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

export const MODELOS: Readonly<Record<string, string>> = { "55": "NF-e", "65": "NFC-e" };

export interface ChaveDeAcesso {
  readonly chave: string;
  readonly uf: string;
  /** Primeiro dia do mes de emissao. Entra no marco de retencao. */
  readonly emissao: DataCivil;
  readonly anoMes: string;
  readonly cnpjEmitente: string;
  readonly modelo: string;
  readonly nomeDoModelo: string;
  readonly serie: string;
  readonly numero: string;
}

export class ChaveDeAcessoInvalida extends ErroDominio {
  readonly codigo = "chave_de_acesso_invalida";
  readonly categoria: CategoriaErro = "validacao";

  constructor(readonly motivo: "formato" | "digito" | "uf" | "mes" | "modelo") {
    super(
      {
        formato: "A chave de acesso tem 44 posições: 6 dígitos, 12 letras ou dígitos e 26 dígitos.",
        digito: "O dígito verificador não confere: confira a chave, há um caractere trocado.",
        uf: "A chave começa com um código de UF que não existe.",
        mes: "O mês de emissão dentro da chave não é válido.",
        modelo: "O modelo dentro da chave não é NF-e (55) nem NFC-e (65).",
      }[motivo],
    );
  }
}

/** Tira espacos, pontos e tracos; maiusculas. E o que se faz com o que a pessoa colou. */
export function normalizarChaveDeAcesso(texto: string): string {
  return texto.toUpperCase().replace(/[\s.\-]/g, "");
}

/** Digito verificador das 43 primeiras posicoes. Exportado para o campo poder validar em qualquer camada. */
export function digitoVerificador(primeiras43: string): string {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  for (let i = 0; i < primeiras43.length; i += 1) {
    const caractere = primeiras43.charCodeAt(primeiras43.length - 1 - i) - 48;
    soma += caractere * pesos[i % 8]!;
  }
  const resto = soma % 11;
  return resto < 2 ? "0" : String(11 - resto);
}

export function interpretarChaveDeAcesso(texto: string): ChaveDeAcesso {
  const chave = normalizarChaveDeAcesso(texto);
  if (!FORMATO_CHAVE_DE_ACESSO.test(chave)) throw new ChaveDeAcessoInvalida("formato");
  if (digitoVerificador(chave.slice(0, 43)) !== chave[43]) throw new ChaveDeAcessoInvalida("digito");

  const uf = UFS[chave.slice(0, 2)];
  if (!uf) throw new ChaveDeAcessoInvalida("uf");
  const ano = 2000 + Number(chave.slice(2, 4));
  const mes = Number(chave.slice(4, 6));
  if (mes < 1 || mes > 12) throw new ChaveDeAcessoInvalida("mes");
  const modelo = chave.slice(20, 22);
  const nomeDoModelo = MODELOS[modelo];
  if (!nomeDoModelo) throw new ChaveDeAcessoInvalida("modelo");

  return {
    chave,
    uf,
    emissao: criarDataCivil(ano, mes, 1),
    anoMes: `${String(mes).padStart(2, "0")}/${ano}`,
    cnpjEmitente: chave.slice(6, 20),
    modelo,
    nomeDoModelo,
    serie: String(Number(chave.slice(22, 25))),
    numero: String(Number(chave.slice(25, 34))),
  };
}

/**
 * Acha uma chave dentro de um texto qualquer — em especial a URL do QR da
 * NFC-e (`...?p=<chave>|2|1|1|...`), onde a chave vem DENTRO da URL e a URL
 * inteira nao e chave. Devolve `null` se nao houver 44 posicoes plausiveis.
 */
export function extrairChaveDeTexto(texto: string): string | null {
  const parametro = /[?&]p=([0-9A-Za-z]{44})/.exec(texto);
  if (parametro?.[1]) return parametro[1].toUpperCase();
  const solta = /(?<![0-9A-Za-z])([0-9]{6}[0-9A-Za-z]{12}[0-9]{26})(?![0-9A-Za-z])/.exec(normalizarChaveDeAcesso(texto));
  return solta?.[1] ?? null;
}
