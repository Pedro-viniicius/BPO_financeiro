import { CabecalhoPagina, EstadoVazio } from "@/interface/componentes/indice";

import { obterContextoDaCasca } from "./contexto-casca";

/**
 * Inicio — provisorio. A tela real (docs/ux/dashboard.md) depende dos casos de
 * uso de caixa, contas e previsao, que chegam nos Gates 6 e 7. Aqui fica
 * apenas o cabecalho padrao e um estado vazio honesto.
 */
export default async function PaginaInicio() {
  const contexto = await obterContextoDaCasca();

  return (
    <>
      <CabecalhoPagina
        titulo="Início"
        empresa={contexto.nomeDaEmpresa}
        descricao="Sua situação de hoje e o que precisa de atenção"
      />
      <EstadoVazio
        titulo="Ainda não há dados financeiros"
        explicacao="Quando houver contas, bancos e movimentações cadastrados, esta tela mostra o disponível de hoje, o que precisa de atenção e os próximos 7 dias."
      />
    </>
  );
}
