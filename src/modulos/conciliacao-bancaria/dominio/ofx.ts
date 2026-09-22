import { criarDataCivil, type DataCivil } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { type CategoriaErro, ErroDominio } from "@/compartilhado/erros/indice";

/**
 * Leitor de arquivos OFX.
 *
 * OFX nao e um formato, sao dois:
 *
 *   1.x  SGML. Tags de valor NAO sao fechadas — `<TRNAMT>-123.45` e o valor
 *        termina onde a proxima tag comeca. Cabecalho em linhas
 *        `CHAVE:VALOR` antes do `<OFX>`.
 *   2.x  XML de verdade, com declaracao `<?xml?>` e `<?OFX ...?>`, e todas as
 *        tags fechadas.
 *
 * Os bancos brasileiros emitem os dois, e o mesmo banco muda de versao entre
 * canais. Por isso o analisador aqui e TOLERANTE: aceita tag fechada ou nao,
 * e ignora fechamento que nao casa com nada em vez de desistir do arquivo.
 *
 * ENCODING e a segunda armadilha. O cabecalho costuma dizer
 * `ENCODING:USASCII` e `CHARSET:1252` — o que significa, na pratica,
 * Windows-1252 (latin-1). Ler esse arquivo como UTF-8 transforma
 * "TARIFA MANUTENÇÃO" em "TARIFA MANUTEN��O" e, pior, faz a descricao mudar
 * entre duas importacoes do mesmo arquivo. A deteccao esta em
 * `decodificarOfx`.
 *
 * Nada aqui toca banco de dados nem rede: recebe bytes, devolve dados.
 */

export class ArquivoOfxInvalido extends ErroDominio {
  readonly codigo = "arquivo_ofx_invalido";
  readonly categoria: CategoriaErro = "validacao";

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem, detalhes);
  }
}

// ---------------------------------------------------------------- estrutura

interface NoOfx {
  readonly nome: string;
  valor?: string;
  readonly filhos: NoOfx[];
}

/**
 * Descobre a codificacao e devolve texto.
 *
 * Ordem: o que o cabecalho declara, depois a validacao real dos bytes. Um
 * arquivo que se declara UTF-8 mas tem bytes invalidos e lido como
 * Windows-1252 — na duvida, vence o que nao produz caractere quebrado, porque
 * Windows-1252 aceita qualquer byte e UTF-8 nao.
 */
export function decodificarOfx(bytes: Uint8Array): string {
  const inicio = new TextDecoder("windows-1252").decode(bytes.slice(0, 2048)).toUpperCase();
  const declaraUtf8 = /ENCODING:\s*UTF-8/.test(inicio) || /ENCODING="UTF-8"/.test(inicio) || /CHARSET:\s*UTF-8/.test(inicio);

  if (declaraUtf8 && ehUtf8Valido(bytes)) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  // Sem declaracao: tenta UTF-8 assim mesmo (arquivos modernos costumam ser),
  // e cai em Windows-1252 quando os bytes nao formam UTF-8 valido.
  if (!declaraUtf8 && !/CHARSET:\s*1252|ENCODING:\s*USASCII/.test(inicio) && ehUtf8Valido(bytes)) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  return new TextDecoder("windows-1252").decode(bytes);
}

function ehUtf8Valido(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transforma o corpo em arvore, aceitando SGML e XML.
 *
 * A regra que resolve os dois: uma tag seguida de TEXTO e uma folha; uma tag
 * seguida de outra tag e um no. Fechamento que nao encontra par e ignorado —
 * em XML, `</TRNAMT>` chega depois da folha ja ter sido criada.
 */
function analisarArvore(corpo: string): NoOfx {
  const raiz: NoOfx = { nome: "#raiz", filhos: [] };
  const pilha: NoOfx[] = [raiz];
  const padrao = /<(\/?)([A-Za-z0-9._]+)[^>]*>([^<]*)/g;

  for (const achado of corpo.matchAll(padrao)) {
    const fechamento = achado[1] === "/";
    const nome = achado[2]!.toUpperCase();
    const texto = (achado[3] ?? "").trim();
    const atual = pilha[pilha.length - 1]!;

    if (fechamento) {
      const posicao = pilha.findLastIndex((no) => no.nome === nome);
      if (posicao > 0) pilha.length = posicao;
      continue;
    }

    if (texto) {
      atual.filhos.push({ nome, valor: desescapar(texto), filhos: [] });
      continue;
    }

    const novo: NoOfx = { nome, filhos: [] };
    atual.filhos.push(novo);
    pilha.push(novo);
  }

  return raiz;
}

/**
 * Entidades XML.
 *
 * XML tem cinco nomeadas (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) e as
 * numericas. Bancos digitais usam numericas para acentos quando o gerador de
 * XML nao confia na codificacao do canal: `Transfer&#234;ncia`. Sem traduzi-las,
 * a descricao chega ilegivel na tela e, pior, duas exportacoes do mesmo
 * lancamento viram textos diferentes.
 *
 * `&amp;` fica por ultimo de proposito: desfaze-la antes transformaria
 * `&amp;lt;` em `<` — o escape duplo deixaria de ser respeitado.
 */
function desescapar(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function procurarTodos(no: NoOfx, nome: string, encontrados: NoOfx[] = []): NoOfx[] {
  for (const filho of no.filhos) {
    if (filho.nome === nome) encontrados.push(filho);
    procurarTodos(filho, nome, encontrados);
  }
  return encontrados;
}

function procurar(no: NoOfx, nome: string): NoOfx | undefined {
  return procurarTodos(no, nome)[0];
}

function valorDe(no: NoOfx | undefined, nome: string): string | undefined {
  if (!no) return undefined;
  return procurar(no, nome)?.valor;
}

// ------------------------------------------------------------------ leitura

/**
 * `20260901120000[-03:EST]` -> 2026-09-01.
 *
 * Fica com a data como o banco escreveu, sem converter fuso. O carimbo de um
 * extrato JA e a data local do lancamento: converter para outro fuso moveria
 * lancamentos de meia-noite para o dia anterior e desalinharia a conciliacao
 * com o que o cliente ve no aplicativo do banco.
 */
export function dataDoOfx(bruto: string): DataCivil {
  const digitos = bruto.trim().slice(0, 8);
  if (!/^\d{8}$/.test(digitos)) {
    throw new ArquivoOfxInvalido(`Data do extrato em formato desconhecido: "${bruto}".`, { valor: bruto });
  }
  return criarDataCivil(Number(digitos.slice(0, 4)), Number(digitos.slice(4, 6)), Number(digitos.slice(6, 8)));
}

/** `-1.234,56` e `-1234.56` viram o mesmo Dinheiro. Bancos emitem os dois. */
export function valorDoOfx(bruto: string): Dinheiro {
  const limpo = bruto.trim().replace(/\s/g, "");
  const normalizado = limpo.includes(",") && limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo.replace(/,/g, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalizado)) {
    throw new ArquivoOfxInvalido(`Valor do extrato em formato desconhecido: "${bruto}".`, { valor: bruto });
  }
  return Dinheiro.deTexto(Number(normalizado).toFixed(2));
}

export interface LancamentoOfx {
  /** FITID: o identificador que o banco da a linha. Base da deduplicacao. */
  readonly identificadorExterno: string | null;
  readonly data: DataCivil;
  readonly tipo: "entrada" | "saida";
  /** Sempre positivo; o sentido esta em `tipo`. */
  readonly valor: Dinheiro;
  readonly descricao: string;
  readonly numeroDocumento: string | null;
  /** A linha como veio, para diagnostico. Nunca e fonte de verdade. */
  readonly dadosBrutos: Readonly<Record<string, string>>;
}

export interface ContaDoOfx {
  /** Codigo de compensacao do banco (BANKID). Nulo em cartao de credito. */
  readonly codigoBanco: string | null;
  readonly agencia: string | null;
  readonly numeroConta: string | null;
}

export interface ExtratoOfx {
  readonly conta: ContaDoOfx;
  readonly moeda: string | null;
  readonly dataInicio: DataCivil | null;
  readonly dataFim: DataCivil | null;
  /** Saldo que o BANCO informa no fim do periodo. Serve para conferir o nosso. */
  readonly saldoFinalInformado: Dinheiro | null;
  readonly lancamentos: readonly LancamentoOfx[];
}

const CAMPOS_BRUTOS = ["TRNTYPE", "DTPOSTED", "TRNAMT", "FITID", "CHECKNUM", "REFNUM", "MEMO", "NAME", "PAYEEID"] as const;

/**
 * Le um arquivo OFX inteiro.
 *
 * Falha cedo e com frase em portugues: um extrato que nao abre e um problema
 * do usuario ("o banco me deu esse arquivo"), nao um erro tecnico.
 */
export function lerOfx(bytes: Uint8Array): ExtratoOfx {
  if (bytes.byteLength === 0) {
    throw new ArquivoOfxInvalido("O arquivo está vazio.");
  }

  const texto = decodificarOfx(bytes);
  if (!/<OFX[\s>]/i.test(texto)) {
    throw new ArquivoOfxInvalido("Este arquivo não parece ser um extrato OFX: não encontramos a marcação <OFX>.");
  }

  const raiz = analisarArvore(texto.slice(texto.search(/<OFX[\s>]/i)));

  const contaBancaria = procurar(raiz, "BANKACCTFROM");
  const contaCartao = procurar(raiz, "CCACCTFROM");
  const origem = contaBancaria ?? contaCartao;

  const listas = procurarTodos(raiz, "BANKTRANLIST").concat(procurarTodos(raiz, "CCTRANLIST"));
  const transacoes = procurarTodos(raiz, "STMTTRN");

  if (transacoes.length === 0) {
    throw new ArquivoOfxInvalido("O arquivo não tem nenhum lançamento (<STMTTRN>). Confira o período exportado no banco.");
  }

  const saldo = procurar(raiz, "LEDGERBAL");

  return {
    conta: {
      codigoBanco: valorDe(origem, "BANKID") ?? null,
      agencia: valorDe(origem, "BRANCHID") ?? null,
      numeroConta: valorDe(origem, "ACCTID") ?? null,
    },
    moeda: valorDe(raiz, "CURDEF") ?? null,
    dataInicio: lerDataOpcional(listas[0], "DTSTART"),
    dataFim: lerDataOpcional(listas[0], "DTEND"),
    saldoFinalInformado: saldo?.filhos.length ? lerValorOpcional(saldo, "BALAMT") : null,
    lancamentos: transacoes.map((transacao) => lerLancamento(transacao)),
  };
}

function lerDataOpcional(no: NoOfx | undefined, nome: string): DataCivil | null {
  const bruto = valorDe(no, nome);
  return bruto ? dataDoOfx(bruto) : null;
}

function lerValorOpcional(no: NoOfx | undefined, nome: string): Dinheiro | null {
  const bruto = valorDe(no, nome);
  return bruto ? valorDoOfx(bruto) : null;
}

function lerLancamento(transacao: NoOfx): LancamentoOfx {
  const dataBruta = valorDe(transacao, "DTPOSTED") ?? valorDe(transacao, "DTUSER");
  const valorBruto = valorDe(transacao, "TRNAMT");
  if (!dataBruta) throw new ArquivoOfxInvalido("Há um lançamento sem data (<DTPOSTED>) no arquivo.");
  if (!valorBruto) throw new ArquivoOfxInvalido("Há um lançamento sem valor (<TRNAMT>) no arquivo.");

  const valor = valorDoOfx(valorBruto);
  if (valor.ehZero()) {
    throw new ArquivoOfxInvalido("Há um lançamento com valor zero no arquivo.");
  }

  const dadosBrutos: Record<string, string> = {};
  for (const campo of CAMPOS_BRUTOS) {
    const valorCampo = valorDe(transacao, campo);
    if (valorCampo) dadosBrutos[campo] = valorCampo;
  }

  /*
   * MEMO e NAME dividem o papel de descricao e cada banco usa um. Quando os
   * dois vem, os dois entram: um costuma trazer o tipo ("PIX RECEBIDO") e o
   * outro a contraparte ("MARIA SOUZA"), e juntos formam a linha que o
   * usuario reconhece no aplicativo do banco.
   */
  const partes = [valorDe(transacao, "MEMO"), valorDe(transacao, "NAME")].filter(
    (parte): parte is string => Boolean(parte),
  );
  const unicas = [...new Set(partes)];

  return {
    identificadorExterno: valorDe(transacao, "FITID") ?? null,
    data: dataDoOfx(dataBruta),
    tipo: valor.ehNegativo() ? "saida" : "entrada",
    valor: valor.absoluto(),
    descricao: unicas.join(" · ") || valorDe(transacao, "TRNTYPE") || "Lançamento sem descrição",
    numeroDocumento: valorDe(transacao, "CHECKNUM") ?? valorDe(transacao, "REFNUM") ?? null,
    dadosBrutos,
  };
}
