import Link from "next/link";

import estilos from "./paginador.module.css";

/**
 * Navegacao entre paginas de uma lista.
 *
 * Tres decisoes deliberadas:
 *
 * 1. Sao LINKS, nao botoes com JavaScript. A pagina atual fica na URL, entao
 *    voltar, recarregar e compartilhar funcionam, e a lista continua navegavel
 *    sem JavaScript nenhum.
 * 2. Os filtros vao junto. Trocar de pagina nunca limpa a busca.
 * 3. A contagem mostra o intervalo exibido E o total JA FILTRADO. Dizer
 *    "1-20 de 20" quando existem 50 no filtro seria pior do que nao dizer
 *    nada: o usuario pararia de procurar.
 *
 * Um botao desabilitado vira `<span>`, nunca `<a>` sem destino: link sem href
 * continua sendo anunciado como link por leitores de tela.
 */
export interface PaginadorProps {
  readonly rota: string;
  /** Os parametros atuais da URL (filtros). `pagina` e substituido. */
  readonly parametros: Readonly<Record<string, string>>;
  readonly pagina: number;
  readonly tamanho: number;
  readonly total: number;
  /** "conta"/"contas", "lançamento"/"lançamentos"... */
  readonly nomeSingular: string;
  readonly nomePlural: string;
}

function comPagina(rota: string, parametros: Readonly<Record<string, string>>, pagina: number): string {
  const busca = new URLSearchParams(parametros);
  if (pagina <= 1) busca.delete("pagina");
  else busca.set("pagina", String(pagina));
  const texto = busca.toString();
  return texto ? `${rota}?${texto}` : rota;
}

export function Paginador({ rota, parametros, pagina, tamanho, total, nomeSingular, nomePlural }: PaginadorProps) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const primeiro = total === 0 ? 0 : (pagina - 1) * tamanho + 1;
  const ultimo = Math.min(pagina * tamanho, total);

  return (
    <nav className={estilos.barra} aria-label={`Páginas de ${nomePlural}`}>
      <p className={estilos.contagem}>
        {total === 0 ? (
          `Nenhuma ${nomeSingular}`
        ) : (
          <>
            Mostrando <strong>{primeiro}</strong>–<strong>{ultimo}</strong> de <strong>{total}</strong>{" "}
            {total === 1 ? nomeSingular : nomePlural}
          </>
        )}
      </p>

      {paginas > 1 ? (
        <div className={estilos.navegacao}>
          {pagina > 1 ? (
            <Link className="acao-secundaria" href={comPagina(rota, parametros, pagina - 1)} rel="prev">
              Anterior
            </Link>
          ) : (
            <span className={estilos.inativo}>Anterior</span>
          )}
          <span className={estilos.pagina} aria-current="page">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link className="acao-secundaria" href={comPagina(rota, parametros, pagina + 1)} rel="next">
              Próxima
            </Link>
          ) : (
            <span className={estilos.inativo}>Próxima</span>
          )}
        </div>
      ) : null}
    </nav>
  );
}

/** Le `?pagina=` com defesa: texto invalido, zero e negativo caem na pagina 1. */
export function paginaDaUrl(valor: string | string[] | undefined): number {
  const numero = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isInteger(numero) && numero > 0 ? numero : 1;
}

/** Quantos itens por pagina. Um numero, um lugar. */
export const TAMANHO_DA_PAGINA = 20;
