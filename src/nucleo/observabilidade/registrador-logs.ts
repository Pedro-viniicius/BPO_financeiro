/**
 * Logs tecnicos estruturados (JSON, uma linha por evento).
 *
 * NAO e auditoria financeira (ver `nucleo/auditoria`). Logs tecnicos servem
 * para operar o sistema: erros, tempos, saude de integracoes.
 *
 * Seguranca: chaves sensiveis sao redigidas automaticamente antes de escrever.
 * Mesmo assim, nunca passe senhas, tokens ou credenciais bancarias para o log.
 */
export type NivelLog = "debug" | "info" | "aviso" | "erro";

const ORDEM_NIVEIS: Record<NivelLog, number> = { debug: 10, info: 20, aviso: 30, erro: 40 };

const CHAVES_SENSIVEIS = [
  "senha",
  "password",
  "token",
  "segredo",
  "secret",
  "autorizacao",
  "authorization",
  "cookie",
  "chave",
  "apikey",
  "api_key",
  "credencial",
];

export interface RegistradorLogs {
  debug(mensagem: string, dados?: Record<string, unknown>): void;
  info(mensagem: string, dados?: Record<string, unknown>): void;
  aviso(mensagem: string, dados?: Record<string, unknown>): void;
  erro(mensagem: string, dados?: Record<string, unknown>): void;
  /** Cria um registrador filho com campos fixos (ex.: requisicaoId). */
  comContexto(contexto: Record<string, unknown>): RegistradorLogs;
}

export function redigirDadosSensiveis(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return "[profundidade excedida]";
  if (Array.isArray(valor)) return valor.map((item) => redigirDadosSensiveis(item, profundidade + 1));
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    const saida: Record<string, unknown> = {};
    for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      const chaveMinuscula = chave.toLowerCase();
      saida[chave] = CHAVES_SENSIVEIS.some((sensivel) => chaveMinuscula.includes(sensivel))
        ? "[redigido]"
        : redigirDadosSensiveis(conteudo, profundidade + 1);
    }
    return saida;
  }
  return valor;
}

export function criarRegistradorLogs(
  origem: string,
  opcoes: { nivelMinimo?: NivelLog; escrever?: (linha: string) => void; contexto?: Record<string, unknown> } = {},
): RegistradorLogs {
  const nivelMinimo = opcoes.nivelMinimo ?? (process.env.LOG_NIVEL as NivelLog | undefined) ?? "info";
  const escrever = opcoes.escrever ?? ((linha: string) => process.stdout.write(`${linha}\n`));
  const contextoFixo = opcoes.contexto ?? {};

  const registrar = (nivel: NivelLog, mensagem: string, dados?: Record<string, unknown>) => {
    if (ORDEM_NIVEIS[nivel] < ORDEM_NIVEIS[nivelMinimo]) return;
    const linha = {
      instante: new Date().toISOString(),
      nivel,
      origem,
      mensagem,
      ...(redigirDadosSensiveis({ ...contextoFixo, ...dados }) as Record<string, unknown>),
    };
    escrever(JSON.stringify(linha));
  };

  return {
    debug: (mensagem, dados) => registrar("debug", mensagem, dados),
    info: (mensagem, dados) => registrar("info", mensagem, dados),
    aviso: (mensagem, dados) => registrar("aviso", mensagem, dados),
    erro: (mensagem, dados) => registrar("erro", mensagem, dados),
    comContexto: (contexto) =>
      criarRegistradorLogs(origem, { nivelMinimo, escrever, contexto: { ...contextoFixo, ...contexto } }),
  };
}
