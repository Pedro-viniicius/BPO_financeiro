import { BOM_UTF8, campoCsv, SEPARADOR_CSV } from "@/modulos/dre/publico";
import { montarXlsx, type AbaDaPlanilha } from "@/compartilhado/planilhas/indice";

import { MAXIMO_LINHAS } from "./planilhas";

/**
 * As planilhas modelo.
 *
 * Um modelo em branco com os cabecalhos certos nao basta: quem preenche
 * precisa saber o que vai em cada coluna, e descobrir isso por tentativa custa
 * um envio de arquivo por duvida. Por isso o modelo traz uma LINHA DE EXEMPLO
 * preenchida e uma aba de instrucoes, coluna por coluna.
 *
 * O exemplo e apagavel e esta escrito com dados obviamente ficticios, para
 * ninguem importa-lo por engano achando que faz parte.
 */

interface Modelo {
  readonly nomeArquivo: string;
  readonly colunas: readonly string[];
  readonly exemplo: readonly string[];
  readonly instrucoes: readonly (readonly [string, string])[];
  readonly larguras: readonly number[];
}

const PESSOAS: Modelo = {
  nomeArquivo: "modelo-clientes-e-fornecedores",
  colunas: ["Nome", "Tipo", "CPF ou CNPJ", "E-mail", "Telefone", "É cliente", "É fornecedor"],
  exemplo: ["Papelaria Exemplo Ltda", "jurídica", "11.222.333/0001-81", "contato@exemplo.com.br", "(35) 3531-0000", "não", "sim"],
  larguras: [38, 12, 22, 30, 18, 12, 14],
  instrucoes: [
    ["Nome", "Obrigatório. Como a pessoa ou empresa é chamada no dia a dia."],
    ["Tipo", "“física” ou “jurídica”. Pode deixar em branco se preencher o CPF/CNPJ — o tipo é deduzido dele."],
    ["CPF ou CNPJ", "Opcional, mas recomendado: é por ele que o sistema reconhece quem já está cadastrado, em vez de duplicar. Pode digitar com pontos e traços. Os dígitos verificadores são conferidos."],
    ["E-mail", "Opcional."],
    ["Telefone", "Opcional."],
    ["É cliente", "“sim” se você emite contas a receber para esta pessoa. Em branco vale por “não”."],
    ["É fornecedor", "“sim” se você paga contas para esta pessoa. Em branco vale por “não”."],
    ["—", "A pessoa precisa ser cliente, fornecedor, ou os dois."],
    ["—", `Até ${MAXIMO_LINHAS} linhas por arquivo. Se tiver mais, divida em dois.`],
    ["—", "Se qualquer linha tiver erro, NADA é importado. Você corrige e envia de novo."],
  ],
};

const CONTAS: Modelo = {
  nomeArquivo: "modelo-contas-em-aberto",
  colunas: ["Tipo", "Descrição", "Cliente ou fornecedor", "Categoria", "Competência", "Vencimento", "Valor", "Parcela", "Valor já pago", "Documento"],
  exemplo: ["pagar", "Aluguel de dezembro", "Papelaria Exemplo Ltda", "Aluguel", "01/12/2025", "20/12/2025", "1.500,00", "3/10", "", "NF 1234"],
  larguras: [10, 34, 30, 24, 14, 14, 14, 10, 14, 16],
  instrucoes: [
    ["—", "UMA LINHA POR PARCELA EM ABERTO. Se um contrato tem três parcelas a vencer, são três linhas."],
    ["Tipo", "“pagar” ou “receber”."],
    ["Descrição", "Obrigatória. O que é esta conta, em poucas palavras."],
    ["Cliente ou fornecedor", "Nome exatamente como está no cadastro, ou o CPF/CNPJ. O documento é mais seguro: nome se escreve de vários jeitos. Importe as pessoas antes das contas."],
    ["Categoria", "Nome de uma categoria ATIVA do plano de contas. É ela que leva o lançamento ao resultado."],
    ["Competência", "Opcional. O mês a que a conta se refere. Em branco, vale o vencimento."],
    ["Vencimento", "Obrigatório. Use 31/12/2025. Precisa ser até a data de corte — o que vence depois dela você lança pela tela."],
    ["Valor", "Obrigatório. Use 1.234,56."],
    ["Parcela", "Opcional. No formato 3/10 (terceira de dez). Em branco, vale 1/1."],
    ["Valor já pago", "Opcional. Quanto já foi pago desta parcela ANTES da data de corte. O sistema importa só o saldo em aberto, e guarda o valor original nas observações — registrar o valor cheio exigiria inventar um pagamento no banco, e o extrato deixaria de fechar."],
    ["Documento", "Opcional. Número da nota, do boleto ou do contrato."],
    ["—", `Até ${MAXIMO_LINHAS} linhas por arquivo.`],
    ["—", "Se qualquer linha tiver erro, NADA é importado."],
  ],
};

function csv(modelo: Modelo): string {
  const linhas = [modelo.colunas, modelo.exemplo].map((valores) => valores.map(campoCsv).join(SEPARADOR_CSV));
  return BOM_UTF8 + linhas.join("\r\n") + "\r\n";
}

function xlsx(modelo: Modelo): Buffer {
  const abas: AbaDaPlanilha[] = [
    {
      nome: "Preencher",
      linhas: [modelo.colunas, modelo.exemplo],
      larguras: modelo.larguras,
    },
    {
      nome: "Instruções",
      linhas: [["Coluna", "O que preencher"], ...modelo.instrucoes.map(([coluna, texto]) => [coluna, texto])],
      larguras: [24, 110],
    },
  ];
  return montarXlsx(abas);
}

export function modeloDePessoas(formato: "csv" | "xlsx"): { nome: string; tipo: string; conteudo: string | Buffer } {
  return formato === "csv"
    ? { nome: `${PESSOAS.nomeArquivo}.csv`, tipo: "text/csv; charset=utf-8", conteudo: csv(PESSOAS) }
    : {
        nome: `${PESSOAS.nomeArquivo}.xlsx`,
        tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        conteudo: xlsx(PESSOAS),
      };
}

export function modeloDeContas(formato: "csv" | "xlsx"): { nome: string; tipo: string; conteudo: string | Buffer } {
  return formato === "csv"
    ? { nome: `${CONTAS.nomeArquivo}.csv`, tipo: "text/csv; charset=utf-8", conteudo: csv(CONTAS) }
    : {
        nome: `${CONTAS.nomeArquivo}.xlsx`,
        tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        conteudo: xlsx(CONTAS),
      };
}
