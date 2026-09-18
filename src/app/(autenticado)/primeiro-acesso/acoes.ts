"use server";

import { acaoInstalarPrimeiraEmpresa as instalar, type EstadoFormularioInstalacao } from "@/nucleo/empresas/publico";

/**
 * Ponte entre o formulario (componente de cliente) e a server action do
 * modulo. O cliente importa DESTE arquivo, marcado com "use server", para que
 * so a referencia da acao va para o navegador — nunca o modulo inteiro.
 */
export async function acaoInstalarPrimeiraEmpresa(anterior: EstadoFormularioInstalacao, formulario: FormData): Promise<EstadoFormularioInstalacao> {
  return instalar(anterior, formulario);
}
