/**
 * Classe base para erros de dominio.
 *
 * Um erro de dominio e uma situacao de negocio prevista (conta nao encontrada,
 * pagamento ja registrado, usuario sem permissao). Ele:
 * - tem um `codigo` estavel (usado por testes, API e interface);
 * - tem uma `mensagem` em portugues, segura para mostrar ao usuario;
 * - pode ter `detalhes` estruturados (nunca dados sensiveis).
 *
 * Cada modulo cria suas subclasses com nomes que descrevem a situacao:
 * `ContaPagarNaoEncontrada`, `PagamentoJaRegistrado`, `UsuarioSemPermissao`.
 * Nao crie erros genericos como "ErroNegocio" quando um nome especifico existe.
 */
export abstract class ErroDominio extends Error {
  abstract readonly codigo: string;
  /** Categoria usada para mapear a resposta HTTP e o tratamento na interface. */
  abstract readonly categoria: CategoriaErro;
  readonly detalhes: Readonly<Record<string, unknown>> | undefined;

  constructor(mensagem: string, detalhes?: Record<string, unknown>) {
    super(mensagem);
    this.name = new.target.name;
    this.detalhes = detalhes;
  }

  toJSON(): { codigo: string; categoria: CategoriaErro; mensagem: string; detalhes?: Record<string, unknown> } {
    return {
      codigo: this.codigo,
      categoria: this.categoria,
      mensagem: this.message,
      ...(this.detalhes ? { detalhes: this.detalhes } : {}),
    };
  }
}

/**
 * Categorias de erro. A camada de interface converte cada categoria em um
 * status HTTP e em um estilo de mensagem, sem que o dominio conheca HTTP.
 *
 * - nao_encontrado   -> 404
 * - validacao        -> 400
 * - regra_negocio    -> 409 (estado atual nao permite a acao)
 * - sem_permissao    -> 403
 * - nao_autenticado  -> 401
 * - conflito         -> 409 (ex.: duplicidade)
 */
export type CategoriaErro =
  | "nao_encontrado"
  | "validacao"
  | "regra_negocio"
  | "sem_permissao"
  | "nao_autenticado"
  | "conflito";

export function ehErroDominio(erro: unknown): erro is ErroDominio {
  return erro instanceof ErroDominio;
}
