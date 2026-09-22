/**
 * Regras de destino por estado de acesso. Funcao pura, sem Next.js, para que
 * a tabela de redirecionamentos (docs/arquitetura/autenticacao-e-empresa-ativa.md,
 * secao 3) seja testavel e comprovadamente sem ciclos.
 */

export type EstadoAcesso = "visitante" | "sem_empresa" | "pronto";

export const ROTAS = {
  raiz: "/",
  entrar: "/entrar",
  criarConta: "/criar-conta",
  primeiroAcesso: "/primeiro-acesso",
  verificacaoDuasEtapas: "/verificacao-duas-etapas",
  esqueciSenha: "/esqueci-senha",
  redefinirSenha: "/redefinir-senha",
  inicio: "/inicio",
} as const;

/**
 * Rotas que nunca sao destino de "retorno" apos entrar.
 *
 * `verificacaoDuasEtapas` entra aqui porque durante o desafio TOTP ainda NAO
 * existe sessao — so o cookie do desafio. Para a tabela de destinos o usuario
 * e visitante, e a tela precisa ser alcancavel nesse estado. Quem ja tem
 * sessao nao tem desafio pendente e e levado adiante.
 */
const ROTAS_DE_ENTRADA: readonly string[] = [
  ROTAS.entrar,
  ROTAS.criarConta,
  ROTAS.verificacaoDuasEtapas,
  ROTAS.esqueciSenha,
  ROTAS.redefinirSenha,
];

/** Rotas que exigem sessao, mas NAO exigem empresa. */
const ROTAS_SO_SESSAO: readonly string[] = [ROTAS.primeiroAcesso];

/** Rotas publicas: qualquer um ve. */
const ROTAS_PUBLICAS: readonly string[] = [...ROTAS_DE_ENTRADA];

/** Para onde o estado leva quando nao ha rota pedida (ex.: apos entrar, ou em `/`). */
export function destinoPadrao(estado: EstadoAcesso): string {
  switch (estado) {
    case "visitante":
      return ROTAS.entrar;
    case "sem_empresa":
      return ROTAS.primeiroAcesso;
    case "pronto":
      return ROTAS.inicio;
  }
}

/**
 * Dado o estado e a rota pedida, devolve `null` se a rota pode ser exibida
 * ou a rota para a qual redirecionar.
 */
export function decidirDestino(estado: EstadoAcesso, rota: string): string | null {
  const caminho = apenasCaminho(rota);

  if (caminho === ROTAS.raiz) return destinoPadrao(estado);

  if (ROTAS_PUBLICAS.includes(caminho)) {
    // Quem ja entrou nao volta para a tela de entrada.
    return estado === "visitante" ? null : destinoPadrao(estado);
  }

  if (ROTAS_SO_SESSAO.includes(caminho)) {
    if (estado === "visitante") return comRetorno(ROTAS.entrar, caminho);
    if (estado === "pronto") return ROTAS.inicio; // instalador nao se repete
    return null;
  }

  // Tudo o mais e a aplicacao: exige sessao + empresa.
  if (estado === "visitante") return comRetorno(ROTAS.entrar, rota);
  if (estado === "sem_empresa") return ROTAS.primeiroAcesso;
  return null;
}

/**
 * Aceita apenas caminhos relativos do proprio site como destino de retorno.
 * Rejeita URLs absolutas, `//host`, esquemas e as rotas de entrada.
 */
export function retornoSeguro(texto: string | null | undefined): string | null {
  if (!texto) return null;
  if (!texto.startsWith("/") || texto.startsWith("//") || texto.startsWith("/\\")) return null;
  if (/[\r\n]/.test(texto)) return null;
  const caminho = apenasCaminho(texto);
  if (ROTAS_DE_ENTRADA.includes(caminho) || caminho === ROTAS.raiz) return null;
  return texto;
}

function comRetorno(destino: string, retorno: string): string {
  const seguro = retornoSeguro(retorno);
  return seguro ? `${destino}?retorno=${encodeURIComponent(seguro)}` : destino;
}

function apenasCaminho(rota: string): string {
  const semQuery = rota.split(/[?#]/)[0] ?? rota;
  return semQuery.length > 1 && semQuery.endsWith("/") ? semQuery.slice(0, -1) : semQuery;
}
