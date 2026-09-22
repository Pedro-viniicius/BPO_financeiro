import Link from "next/link";

import { EstadoVazio } from "@/interface/componentes/indice";

/**
 * Registro inexistente dentro da aplicacao.
 *
 * Aparece dentro da casca, com a navegacao no lugar — quem errou um link nao
 * e jogado para fora do sistema. O texto NAO diz se o registro existe em outra
 * empresa: `buscarPorId` filtra por empresa, entao "nao encontrado" cobre tanto
 * o id inexistente quanto o de outra empresa, e essa ambiguidade e proposital.
 */
export default function NaoEncontrado() {
  return (
    <EstadoVazio
      titulo="Não encontramos este registro"
      explicacao="Ele pode ter sido excluído, ou o endereço pode estar incompleto. Confira o link e tente de novo."
      acao={<Link className="acao-primaria" href="/inicio">Voltar para o início</Link>}
    />
  );
}
