import estilos from "./cabecalho-aplicacao.module.css";

export interface CabecalhoAplicacaoProps {
  readonly nomeDaEmpresa: string;
  readonly nomeDoUsuario: string;
  /** Papel na empresa ativa; mostrado para explicar acoes ausentes. */
  readonly papelDoUsuario: string;
  readonly pontosDeAtencao?: number;
}

/**
 * Cabecalho fixo: empresa ativa, busca, avisos e usuario.
 *
 * O seletor de empresa fica no primeiro lugar do cabecalho porque lancar na
 * empresa errada e o erro mais caro do produto (Carlos, BPO).
 */
export function CabecalhoAplicacao({
  nomeDaEmpresa,
  nomeDoUsuario,
  papelDoUsuario,
  pontosDeAtencao = 0,
}: CabecalhoAplicacaoProps) {
  return (
    <header className={estilos.cabecalho}>
      <span className={estilos.marca}>Financeiro</span>

      <button type="button" className={estilos.empresa} aria-label={`Empresa ativa: ${nomeDaEmpresa}. Trocar empresa`}>
        <span className={estilos.rotuloEmpresa}>Empresa</span>
        <span className={estilos.nomeEmpresa}>{nomeDaEmpresa}</span>
      </button>

      <div className={estilos.busca}>
        <label className="apenas-leitor-de-tela" htmlFor="busca-global">
          Buscar fornecedor, cliente, código ou valor
        </label>
        <input
          id="busca-global"
          type="search"
          className={estilos.campoBusca}
          placeholder="Buscar (Ctrl+K)"
        />
      </div>

      <button type="button" className={estilos.acao} aria-label={`Avisos: ${pontosDeAtencao} pontos de atenção`}>
        <span aria-hidden="true">Avisos</span>
        {pontosDeAtencao > 0 ? <span className={estilos.contador}>{pontosDeAtencao}</span> : null}
      </button>

      <button type="button" className={estilos.usuario}>
        <span className={estilos.nomeUsuario}>{nomeDoUsuario}</span>
        <span className={estilos.papel}>{papelDoUsuario}</span>
      </button>
    </header>
  );
}
