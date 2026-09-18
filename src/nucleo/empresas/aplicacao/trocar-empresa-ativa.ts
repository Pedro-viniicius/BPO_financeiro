import { falha, type Resultado, sucesso } from "@/compartilhado/erros/resultado";
import type { IdUsuario } from "@/compartilhado/tipos/identificadores";
import { UsuarioSemAcessoAEmpresa } from "@/nucleo/autorizacao/publico";

import type { EmpresaAcessivel } from "../dominio/acesso-empresas";
import type { LeitorAcessoEmpresas } from "./repositorio-acesso-empresas";

/**
 * Valida a troca de empresa ativa. O id pedido vem do navegador e por isso
 * so e aceito se estiver entre as empresas acessiveis do usuario, lidas do
 * banco agora — nunca de um cookie ou de uma lista enviada pelo cliente.
 *
 * Devolve a empresa validada; quem chama grava a preferencia (cookie).
 */
export async function trocarEmpresaAtiva(
  leitor: LeitorAcessoEmpresas,
  usuarioId: IdUsuario,
  empresaPedidaId: string,
): Promise<Resultado<EmpresaAcessivel, UsuarioSemAcessoAEmpresa>> {
  const acessiveis = await leitor.listarEmpresasAcessiveis(usuarioId);
  const empresa = acessiveis.find((candidata) => candidata.empresaId === empresaPedidaId);
  if (!empresa) {
    return falha(new UsuarioSemAcessoAEmpresa());
  }
  return sucesso(empresa);
}
