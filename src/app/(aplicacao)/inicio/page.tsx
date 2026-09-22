import { CabecalhoPagina, EstadoVazio } from "@/interface/componentes/indice";
import { exigirAcesso, ROTAS } from "@/nucleo/empresas/publico";

/**
 * Inicio — provisorio. A tela real (docs/ux/dashboard.md) depende dos casos de
 * uso de caixa, contas e previsao, que chegam nos Gates 6 e 7. Aqui fica
 * apenas o cabecalho padrao e um estado vazio honesto.
 *
 * `exigirAcesso` (ADR-026) cobre a cadeia inteira: sessao, empresa ativa,
 * vinculo ativo e permissao. A permissao e a mesma que o mapa de navegacao
 * declara para este destino — o menu e a tela concordam, mas quem decide e o
 * servidor, aqui.
 */
export default async function PaginaInicio() {
  const { empresaAtiva } = await exigirAcesso("relatorios.visualizar", ROTAS.inicio);

  return (
    <>
      <CabecalhoPagina
        titulo="Início"
        empresa={empresaAtiva.nomeFantasia ?? empresaAtiva.nome}
        descricao="Sua situação de hoje e o que precisa de atenção"
      />
      <EstadoVazio
        titulo="Ainda não há dados financeiros"
        explicacao="Quando houver contas, bancos e movimentações cadastrados, esta tela mostra o disponível de hoje, o que precisa de atenção e os próximos 7 dias."
      />
    </>
  );
}
