import { z } from "zod";

/**
 * Leitura e validacao das variaveis de ambiente.
 *
 * Todas as configuracoes sensiveis (senhas, chaves) chegam por variaveis de
 * ambiente — nunca por arquivo versionado. A lista completa, com explicacao,
 * esta em `.env.exemplo`. Se algo obrigatorio faltar, a aplicacao para na
 * inicializacao com uma mensagem clara, em vez de falhar no meio de uma operacao.
 *
 * Importante: este modulo so deve ser importado no servidor. Nunca exponha
 * `variaveisAmbiente` a componentes de cliente.
 */
const esquemaAmbiente = z.object({
  AMBIENTE: z.enum(["desenvolvimento", "homologacao", "demonstracao", "producao"]).default("desenvolvimento"),

  // Banco de dados (usuario da aplicacao — ver docs/arquitetura/banco-dados.md)
  BANCO_URL: z.string().min(1, "BANCO_URL e obrigatoria."),
  BANCO_URL_MIGRACAO: z.string().optional(),
  BANCO_MAXIMO_CONEXOES: z.coerce.number().int().min(1).max(100).default(10),

  // Aplicacao
  APLICACAO_URL: z.url({ message: "APLICACAO_URL precisa ser uma URL completa (https://...)." }),
  APLICACAO_SEGREDO: z.string().min(32, "APLICACAO_SEGREDO precisa ter ao menos 32 caracteres."),

  // Autenticacao (opcional): "Continuar com Google"
  GOOGLE_CLIENTE_ID: z.string().optional(),
  GOOGLE_CLIENTE_SEGREDO: z.string().optional(),

  // E-mail (adaptador escolhido por variavel; "console" apenas em desenvolvimento)
  EMAIL_PROVEDOR: z.enum(["console", "smtp"]).default("console"),
  EMAIL_REMETENTE: z.string().default("Financeiro <nao-responda@localhost>"),
  SMTP_URL: z.string().optional(),

  // Inteligencia artificial (opcional; desligada por padrao)
  IA_PROVEDOR: z.enum(["desligado", "anthropic", "openai", "local"]).default("desligado"),
  IA_CHAVE_API: z.string().optional(),
  IA_MODELO: z.string().optional(),
  IA_URL_BASE: z.string().optional(),

  // Licenciamento
  LICENCA_ARQUIVO: z.string().default("./licenca.json"),

  // Tarefas em segundo plano
  TAREFAS_INTERVALO_MS: z.coerce.number().int().min(250).default(2000),

  // Observabilidade
  LOG_NIVEL: z.enum(["debug", "info", "aviso", "erro"]).default("info"),
});

export type VariaveisAmbiente = z.infer<typeof esquemaAmbiente>;

let cache: VariaveisAmbiente | undefined;

/** Le e valida as variaveis. O resultado e guardado em memoria apos a primeira leitura. */
export function obterVariaveisAmbiente(origem: Record<string, string | undefined> = process.env): VariaveisAmbiente {
  if (cache) return cache;
  const resultado = esquemaAmbiente.safeParse(origem);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((problema) => `- ${problema.path.join(".")}: ${problema.message}`);
    throw new Error(`Configuracao invalida. Verifique o arquivo .env (veja .env.exemplo):\n${problemas.join("\n")}`);
  }
  cache = resultado.data;
  return cache;
}

/** Apenas para testes: descarta o cache. */
export function limparCacheVariaveisAmbiente(): void {
  cache = undefined;
}

export function ehProducao(variaveis = obterVariaveisAmbiente()): boolean {
  return variaveis.AMBIENTE === "producao";
}

/**
 * Aviso a mostrar no topo do sistema quando o ambiente NAO e producao.
 *
 * Uma vitrine identica ao sistema real e um convite a lancar dado de verdade
 * nela — e a conferir saldo num lugar que ninguem faz backup. Producao nao
 * recebe faixa nenhuma, para nao virar ruido no uso diario.
 */
export function avisoDoAmbiente(
  variaveis = obterVariaveisAmbiente(),
): { rotulo: string; explicacao: string } | null {
  switch (variaveis.AMBIENTE) {
    case "producao":
      return null;
    case "demonstracao":
      return {
        rotulo: "Ambiente de demonstração",
        explicacao: "Os dados daqui servem para conhecer o sistema e podem ser apagados a qualquer momento. Não lance informação real.",
      };
    case "homologacao":
      return {
        rotulo: "Ambiente de homologação",
        explicacao: "Ambiente de testes antes de subir para produção. O que você lançar aqui não vale.",
      };
    default:
      return {
        rotulo: "Ambiente de desenvolvimento",
        explicacao: "Máquina de desenvolvimento. Os dados são descartáveis.",
      };
  }
}
