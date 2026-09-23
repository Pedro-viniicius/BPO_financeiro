import { dataCivilDeTexto, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import type { LinhaDaPlanilha } from "@/compartilhado/planilhas/indice";
import { validarCnpj, validarCpf } from "@/compartilhado/validacao/indice";

/**
 * Validacao das planilhas de carga inicial.
 *
 * A regra que manda aqui e TUDO OU NADA: se qualquer linha estiver errada,
 * nada e gravado. O motivo nao e purismo — e que uma importacao pela metade e
 * pior do que nenhuma. A pessoa nao sabe o que entrou, corrige a planilha
 * inteira, importa de novo e duplica o que ja tinha passado.
 *
 * Por isso a validacao roda em TODAS as linhas antes de qualquer gravacao, e
 * devolve todos os erros de uma vez, cada um com linha, coluna e motivo. Parar
 * no primeiro erro faria a pessoa descobrir os problemas um por um, com um
 * envio de arquivo entre cada descoberta.
 */

export interface ErroDaLinha {
  /** Numero da linha no arquivo, como aparece no Excel. */
  readonly linha: number;
  /** Cabecalho da coluna, como esta na planilha modelo. */
  readonly coluna: string;
  readonly motivo: string;
  /** O que estava escrito ali, para a pessoa localizar sem abrir o arquivo. */
  readonly valor: string;
}

export interface PessoaImportada {
  readonly linha: number;
  readonly nome: string;
  readonly tipo: "fisica" | "juridica";
  readonly documento: string | null;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly ehCliente: boolean;
  readonly ehFornecedor: boolean;
}

export interface ContaImportada {
  readonly linha: number;
  readonly tipo: "pagar" | "receber";
  readonly descricao: string;
  /** Nome ou documento da pessoa, como veio na planilha. */
  readonly pessoa: string;
  readonly categoria: string;
  readonly dataCompetencia: DataCivil;
  readonly dataVencimento: DataCivil;
  readonly valor: Dinheiro;
  readonly numeroParcela: number;
  readonly quantidadeParcelas: number;
  readonly valorPago: Dinheiro;
  readonly documento: string | null;
}

export const COLUNAS_PESSOAS = [
  "nome",
  "tipo",
  "cpf ou cnpj",
  "e-mail",
  "telefone",
  "e cliente",
  "e fornecedor",
] as const;

export const COLUNAS_CONTAS = [
  "tipo",
  "descricao",
  "cliente ou fornecedor",
  "categoria",
  "competencia",
  "vencimento",
  "valor",
  "parcela",
  "valor ja pago",
  "documento",
] as const;

/** Limites informados na tela. Acima disso, a pessoa divide o arquivo. */
export const MAXIMO_LINHAS = 2000;
export const MAXIMO_BYTES = 2 * 1024 * 1024;

const SIM = new Set(["sim", "s", "x", "1", "true", "verdadeiro"]);
const NAO = new Set(["", "nao", "não", "n", "0", "false", "falso"]);

function ehSim(valor: string): boolean | null {
  const limpo = valor.trim().toLowerCase();
  if (SIM.has(limpo)) return true;
  if (NAO.has(limpo)) return false;
  return null;
}

/** "1.234,56", "1234.56", "R$ 1.234,56" -> Dinheiro. Nulo quando nao da. */
function lerDinheiro(valor: string): Dinheiro | null {
  const limpo = valor.replace(/\s|R\$/gi, "").trim();
  if (!limpo) return null;
  try {
    // Com virgula decimal (formato brasileiro) ou sem.
    return limpo.includes(",") ? Dinheiro.deTextoBrasileiro(limpo) : Dinheiro.deTexto(limpo.replace(/\.(?=\d{3}\b)/g, ""));
  } catch {
    return null;
  }
}

/** Aceita 31/12/2025 e 2025-12-31. O primeiro e o que a pessoa digita. */
function lerData(valor: string): DataCivil | null {
  const limpo = valor.trim();
  if (!limpo) return null;

  const brasileiro = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpo);
  const texto = brasileiro
    ? `${brasileiro[3]}-${brasileiro[2]!.padStart(2, "0")}-${brasileiro[1]!.padStart(2, "0")}`
    : limpo;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  try {
    const data = dataCivilDeTexto(texto);
    // `dataCivilDeTexto` aceita o formato; aqui se confere que a data EXISTE
    // (31/02 passa no formato e nao existe no calendario).
    const [ano, mes, dia] = texto.split("-").map(Number);
    const conferencia = new Date(Date.UTC(ano!, mes! - 1, dia!));
    if (conferencia.getUTCMonth() !== mes! - 1 || conferencia.getUTCDate() !== dia!) return null;
    return data;
  } catch {
    return null;
  }
}

/** "3/10" -> { numero: 3, quantidade: 10 }. Vazio vale por "1/1". */
function lerParcela(valor: string): { numero: number; quantidade: number } | null {
  const limpo = valor.trim();
  if (!limpo) return { numero: 1, quantidade: 1 };

  const casamento = /^(\d{1,3})\s*\/\s*(\d{1,3})$/.exec(limpo);
  if (!casamento) return null;

  const numero = Number(casamento[1]);
  const quantidade = Number(casamento[2]);
  if (numero < 1 || quantidade < 1 || numero > quantidade) return null;
  return { numero, quantidade };
}

export function validarPlanilhaDePessoas(linhas: readonly LinhaDaPlanilha[]): {
  pessoas: PessoaImportada[];
  erros: ErroDaLinha[];
} {
  const pessoas: PessoaImportada[] = [];
  const erros: ErroDaLinha[] = [];
  const documentosVistos = new Map<string, number>();

  for (const { numero, campos } of linhas) {
    const erro = (coluna: string, motivo: string, valor = "") => erros.push({ linha: numero, coluna, motivo, valor });

    const nome = (campos["nome"] ?? "").trim();
    if (!nome) erro("Nome", "Obrigatório.");

    const documentoBruto = (campos["cpf ou cnpj"] ?? "").replace(/\D/g, "");
    let documento: string | null = null;
    if (documentoBruto) {
      const valido = documentoBruto.length === 11 ? validarCpf(documentoBruto) : documentoBruto.length === 14 ? validarCnpj(documentoBruto) : false;
      if (!valido) {
        erro("CPF ou CNPJ", "Documento inválido: confira os dígitos.", campos["cpf ou cnpj"] ?? "");
      } else {
        /*
         * Documento repetido DENTRO do arquivo e erro, nao deduplicacao
         * silenciosa: as duas linhas costumam trazer dados diferentes, e
         * escolher uma por conta propria seria decidir no lugar da pessoa.
         */
        const anterior = documentosVistos.get(documentoBruto);
        if (anterior) {
          erro("CPF ou CNPJ", `Documento repetido: já aparece na linha ${anterior}.`, campos["cpf ou cnpj"] ?? "");
        } else {
          documentosVistos.set(documentoBruto, numero);
          documento = documentoBruto;
        }
      }
    }

    const tipoInformado = (campos["tipo"] ?? "").trim().toLowerCase();
    let tipo: "fisica" | "juridica";
    if (tipoInformado.startsWith("f")) tipo = "fisica";
    else if (tipoInformado.startsWith("j")) tipo = "juridica";
    else if (documento) tipo = documento.length === 11 ? "fisica" : "juridica";
    else {
      tipo = "juridica";
      erro("Tipo", "Informe “física” ou “jurídica” (ou preencha o CPF/CNPJ).", campos["tipo"] ?? "");
    }

    if (documento) {
      const esperado = documento.length === 11 ? "fisica" : "juridica";
      if (tipo !== esperado) {
        erro("Tipo", `O documento é de pessoa ${esperado === "fisica" ? "física" : "jurídica"}.`, campos["tipo"] ?? "");
      }
    }

    const email = (campos["e-mail"] ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erro("E-mail", "E-mail inválido.", email);

    const cliente = ehSim(campos["e cliente"] ?? "");
    const fornecedor = ehSim(campos["e fornecedor"] ?? "");
    if (cliente === null) erro("É cliente", "Responda “sim” ou deixe em branco.", campos["e cliente"] ?? "");
    if (fornecedor === null) erro("É fornecedor", "Responda “sim” ou deixe em branco.", campos["e fornecedor"] ?? "");
    if (cliente === false && fornecedor === false) {
      erro("É cliente", "A pessoa precisa ser cliente, fornecedor, ou os dois.");
    }

    pessoas.push({
      linha: numero,
      nome,
      tipo,
      documento,
      email: email || null,
      telefone: (campos["telefone"] ?? "").trim() || null,
      ehCliente: cliente === true,
      ehFornecedor: fornecedor === true,
    });
  }

  return { pessoas, erros };
}

export function validarPlanilhaDeContas(
  linhas: readonly LinhaDaPlanilha[],
  dataDeCorte: DataCivil | null,
): { contas: ContaImportada[]; erros: ErroDaLinha[] } {
  const contas: ContaImportada[] = [];
  const erros: ErroDaLinha[] = [];

  for (const { numero, campos } of linhas) {
    const erro = (coluna: string, motivo: string, valor = "") => erros.push({ linha: numero, coluna, motivo, valor });

    const tipoBruto = (campos["tipo"] ?? "").trim().toLowerCase();
    const tipo: "pagar" | "receber" | null = tipoBruto.startsWith("pag") ? "pagar" : tipoBruto.startsWith("receb") ? "receber" : null;
    if (!tipo) erro("Tipo", "Informe “pagar” ou “receber”.", campos["tipo"] ?? "");

    const descricao = (campos["descricao"] ?? "").trim();
    if (!descricao) erro("Descrição", "Obrigatória.");

    const pessoa = (campos["cliente ou fornecedor"] ?? "").trim();
    if (!pessoa) erro("Cliente ou fornecedor", "Obrigatório: informe o nome ou o CPF/CNPJ.");

    const categoria = (campos["categoria"] ?? "").trim();
    if (!categoria) erro("Categoria", "Obrigatória: é ela que leva o lançamento ao resultado.");

    const vencimento = lerData(campos["vencimento"] ?? "");
    if (!vencimento) erro("Vencimento", "Data inválida. Use 31/12/2025.", campos["vencimento"] ?? "");

    // Sem competencia informada, vale o vencimento: e o que o Gate 5 faz ao
    // criar um titulo pela tela.
    const competenciaInformada = (campos["competencia"] ?? "").trim();
    const competencia = competenciaInformada ? lerData(competenciaInformada) : vencimento;
    if (competenciaInformada && !competencia) erro("Competência", "Data inválida. Use 31/12/2025.", competenciaInformada);

    const valor = lerDinheiro(campos["valor"] ?? "");
    if (!valor) erro("Valor", "Valor inválido. Use 1.234,56.", campos["valor"] ?? "");
    else if (!valor.ehPositivo()) erro("Valor", "Precisa ser maior que zero.", campos["valor"] ?? "");

    const parcela = lerParcela(campos["parcela"] ?? "");
    if (!parcela) erro("Parcela", "Use o formato 3/10, com o número menor ou igual ao total.", campos["parcela"] ?? "");

    const pagoBruto = (campos["valor ja pago"] ?? "").trim();
    const pago = pagoBruto ? lerDinheiro(pagoBruto) : Dinheiro.zero();
    if (pagoBruto && !pago) erro("Valor já pago", "Valor inválido. Use 1.234,56.", pagoBruto);
    else if (pago && valor && pago.maiorQue(valor)) {
      erro("Valor já pago", "Não pode ser maior que o valor da conta.", pagoBruto);
    }

    /*
     * A carga inicial traz o que ESTAVA EM ABERTO na data de corte. Um
     * vencimento posterior a ela e um lancamento que deveria ter nascido no
     * sistema, pela tela — importar seria criar uma segunda porta de entrada
     * para o mesmo dado, e e assim que aparece titulo duplicado.
     */
    if (vencimento && dataDeCorte && vencimento > dataDeCorte) {
      erro(
        "Vencimento",
        `Vence depois da data de corte (${dataDeCorte.split("-").reverse().join("/")}). Lance essa conta pela tela, não pela carga inicial.`,
        campos["vencimento"] ?? "",
      );
    }

    if (tipo && descricao && pessoa && categoria && vencimento && competencia && valor && parcela && pago) {
      contas.push({
        linha: numero,
        tipo,
        descricao,
        pessoa,
        categoria,
        dataCompetencia: competencia,
        dataVencimento: vencimento,
        valor,
        numeroParcela: parcela.numero,
        quantidadeParcelas: parcela.quantidade,
        valorPago: pago,
        documento: (campos["documento"] ?? "").trim() || null,
      });
    }
  }

  return { contas, erros };
}
