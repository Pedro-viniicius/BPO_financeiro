/** Ponto de entrada do conceito compartilhado "erros". */
export { ErroDominio, ehErroDominio, type CategoriaErro } from "./erro-dominio";
export { ErroValidacao, RegistroNaoEncontrado, UsuarioNaoAutenticado } from "./erros-comuns";
export { desembrulhar, falha, sucesso, type Resultado } from "./resultado";
