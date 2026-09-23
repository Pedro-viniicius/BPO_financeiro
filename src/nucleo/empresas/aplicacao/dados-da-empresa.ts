import type { DataCivil } from "@/compartilhado/datas/indice";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";

/**
 * Os dados cadastrais da propria empresa.
 *
 * Ate o Gate 9 so existiam nome, nome fantasia e CNPJ, preenchidos no primeiro
 * acesso e nunca mais editaveis pela interface. Faltavam endereco e contato —
 * que aparecem em documento e cobranca — e, sobretudo, a DATA DE CORTE.
 *
 * A data de corte e o dia em que a empresa passou a usar o sistema. E ela que
 * separa "o que veio de antes" do "o que nasceu aqui": a carga inicial usa
 * essa data para os saldos bancarios e para saber quais titulos em aberto
 * importar. Sem ela, um saldo informado nao tem a que dia se referir.
 */

export interface DadosDaEmpresa {
  /** Razao social. E o `nome` da empresa no modelo. */
  readonly razaoSocial: string;
  readonly nomeFantasia: string | null;
  /** Somente digitos. */
  readonly cnpj: string | null;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly cep: string | null;
  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly municipio: string | null;
  readonly uf: string | null;
  readonly dataInicioUso: DataCivil | null;
  readonly fusoHorario: string;
}

export interface RepositorioDadosDaEmpresa {
  obter(escopo: EscopoEmpresa): Promise<DadosDaEmpresa | null>;
  /**
   * Grava os dados e registra na auditoria o antes e o depois.
   *
   * O CNPJ e unico no sistema inteiro: gravar um ja usado por outra empresa
   * e recusado pelo banco, e o chamador traduz isso em mensagem.
   */
  salvar(escopo: EscopoEmpresa, dados: DadosDaEmpresa, usuarioId: string): Promise<void>;
}
