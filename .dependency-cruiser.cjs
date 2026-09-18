/**
 * Regras de arquitetura verificadas por `pnpm verificar:arquitetura`.
 *
 * Ferramenta: dependency-cruiser (analisa as importacoes entre arquivos).
 * Se qualquer regra abaixo for violada, o comando falha e a CI para.
 *
 * Resumo das fronteiras (ver docs/arquitetura/dependencias.md):
 *   Interface -> Aplicacao -> Dominio ; Infraestrutura implementa contratos.
 *   Modulos so se conhecem pelo `publico.ts`.
 *   Dominio e aplicacao nao conhecem Next.js, Drizzle, Better Auth, SDKs de IA ou de bancos.
 *   Provedores externos so sao importados pela raiz de composicao.
 */

/** Pacotes que representam infraestrutura/frameworks e nao podem chegar ao dominio. */
const PACOTES_FRAMEWORK = "node_modules/(next|react|react-dom|drizzle-orm|drizzle-kit|postgres|pg|better-auth)($|/)";

/** SDKs de inteligencia artificial: so dentro de integracoes/inteligencia-artificial/provedores. */
const PACOTES_IA = "node_modules/(openai|@anthropic-ai|@ai-sdk|ai|@google/generative-ai|@mistralai|ollama)($|/)";

/** Arquivos que podem usar frameworks: camadas tecnicas e pontos de entrada. */
const CAMINHOS_TECNICOS = "/(infraestrutura|interface)/|^src/nucleo/banco-dados/|^src/banco-dados/|^src/app/|^src/composicao/|\\.teste\\.tsx?$";

module.exports = {
  forbidden: [
    {
      name: "sem-dependencias-circulares",
      comment: "Ciclos de importacao tornam o codigo impossivel de entender e de extrair. Quebre o ciclo com um contrato ou evento.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "dominio-nao-conhece-frameworks",
      comment: "Regras de negocio (dominio/ e aplicacao/) nao importam Next.js, Drizzle, Better Auth, postgres.",
      severity: "error",
      from: { path: "^src/(modulos|nucleo|integracoes)/[^/]+/(dominio|aplicacao)/", pathNot: "\\.teste\\.tsx?$" },
      to: { path: PACOTES_FRAMEWORK },
    },
    {
      name: "frameworks-so-em-camadas-tecnicas",
      comment: "Fora de infraestrutura/, interface/, app/, composicao/ e banco-dados/, ninguem importa frameworks.",
      severity: "error",
      from: { path: "^src/", pathNot: CAMINHOS_TECNICOS },
      to: { path: PACOTES_FRAMEWORK },
    },
    {
      name: "dominio-nao-importa-camadas-superiores",
      comment: "dominio/ so pode importar dominio/ do proprio modulo e compartilhado/.",
      severity: "error",
      from: { path: "^src/(modulos|nucleo|integracoes)/([^/]+)/dominio/" },
      to: { path: "^src/(modulos|nucleo|integracoes)/[^/]+/(aplicacao|infraestrutura|interface)/" },
    },
    {
      name: "aplicacao-nao-importa-infraestrutura",
      comment: "aplicacao/ depende de contratos, nunca de implementacoes (infraestrutura/) nem de interface/.",
      severity: "error",
      from: { path: "^src/(modulos|nucleo|integracoes)/([^/]+)/aplicacao/", pathNot: "\\.teste\\.tsx?$" },
      to: { path: "^src/(modulos|nucleo|integracoes)/[^/]+/(infraestrutura|interface)/" },
    },
    {
      name: "modulos-so-se-conhecem-pelo-publico",
      comment: "Um modulo so importa de outro modulo o arquivo publico.ts. Excecao: arquivos de esquema importam outros esquemas (chaves estrangeiras).",
      severity: "error",
      from: { path: "^src/modulos/([^/]+)/", pathNot: "/infraestrutura/esquema[^/]*\\.ts$" },
      to: { path: "^src/modulos/", pathNot: ["^src/modulos/$1/", "^src/modulos/[^/]+/publico\\.ts$"] },
    },
    {
      name: "nucleo-so-se-conhece-pelo-publico",
      comment: "Dentro de nucleo/, um servico so importa de outro o publico.ts. Excecao: arquivos de esquema importam outros esquemas (chaves estrangeiras).",
      severity: "error",
      from: { path: "^src/nucleo/([^/]+)/", pathNot: "/infraestrutura/esquema[^/]*\\.ts$" },
      to: { path: "^src/nucleo/", pathNot: ["^src/nucleo/$1/", "^src/nucleo/[^/]+/publico\\.ts$"] },
    },
    {
      name: "integracoes-so-se-conhecem-pelo-publico",
      severity: "error",
      from: { path: "^src/integracoes/([^/]+)/" },
      to: { path: "^src/integracoes/", pathNot: ["^src/integracoes/$1/", "^src/integracoes/[^/]+/publico\\.ts$"] },
    },
    {
      name: "modulos-importam-nucleo-so-pelo-publico",
      comment: "Modulos de negocio usam nucleo/ (auditoria, autorizacao, eventos...) apenas pelo publico.ts. Excecao: esquema -> esquema (chaves estrangeiras).",
      severity: "error",
      from: { path: "^src/(modulos|integracoes|app)/", pathNot: "/infraestrutura/esquema[^/]*\\.ts$" },
      to: { path: "^src/nucleo/", pathNot: "^src/nucleo/[^/]+/publico\\.ts$" },
    },
    {
      name: "modulos-importam-integracoes-so-pelo-publico",
      severity: "error",
      from: { path: "^src/(modulos|nucleo|app)/" },
      to: { path: "^src/integracoes/", pathNot: "^src/integracoes/[^/]+/publico\\.ts$" },
    },
    {
      name: "provedores-externos-so-na-composicao",
      comment: "Implementacoes concretas de IA, bancos, e-mail (provedores/) so sao escolhidas na raiz de composicao.",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/composicao/", "^src/integracoes/([^/]+)/"] },
      to: { path: "^src/integracoes/[^/]+/provedores/" },
    },
    {
      name: "sdks-de-ia-so-em-provedores",
      comment: "Modulos financeiros nunca chamam um SDK de IA diretamente (ADR-010).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/integracoes/inteligencia-artificial/provedores/" },
      to: { path: PACOTES_IA },
    },
    {
      name: "sdks-bancarios-so-em-provedores",
      comment: "Qualquer SDK de banco/Open Finance so pode ser importado em integracoes/bancarias/provedores/ (ADR-011). Adicione o nome do pacote aqui ao contratar uma integracao.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/integracoes/bancarias/provedores/" },
      to: { path: "node_modules/(pluggy-sdk|belvo|@itau|@bradesco|@sicredi|@banco-do-brasil)($|/)" },
    },
    {
      name: "nucleo-nao-importa-modulos",
      comment: "O nucleo e generico; nao pode conhecer regras de negocio.",
      severity: "error",
      from: { path: "^src/nucleo/" },
      to: { path: "^src/modulos/" },
    },
    {
      name: "integracoes-nao-importam-modulos",
      comment: "Adaptadores externos nao conhecem os modulos de negocio; a ligacao e feita pela composicao ou por eventos.",
      severity: "error",
      from: { path: "^src/integracoes/" },
      to: { path: "^src/modulos/" },
    },
    {
      name: "compartilhado-nao-importa-nada-interno",
      comment: "compartilhado/ so depende de si mesmo e de bibliotecas puras (zod).",
      severity: "error",
      from: { path: "^src/compartilhado/" },
      to: { path: "^src/(modulos|nucleo|integracoes|app|composicao|banco-dados)/" },
    },
    {
      name: "app-nao-importa-infraestrutura",
      comment: "Rotas e telas (app/) nunca acessam o banco ou implementacoes; usam publico.ts, composicao/ e compartilhado/.",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "/(infraestrutura|dominio|aplicacao)/|^src/banco-dados/" },
    },
    {
      name: "esquemas-so-importam-esquemas",
      comment: "Um arquivo de esquema (infraestrutura/esquema*.ts) so importa outros esquemas e os utilitarios de src/banco-dados/esquemas/. Fecha a excecao das regras de publico.ts.",
      severity: "error",
      from: { path: "/infraestrutura/esquema[^/]*\\.ts$" },
      to: { path: "^src/", pathNot: ["/infraestrutura/esquema[^/]*\\.ts$", "^src/banco-dados/esquemas/"] },
    },
    {
      name: "banco-dados-so-agrega-esquemas",
      comment: "src/banco-dados/ apenas reune esquemas e aplica migracoes; nao importa regras. Testes de integracao (testes/) podem usar publico.ts.",
      severity: "error",
      from: { path: "^src/banco-dados/", pathNot: "^src/banco-dados/testes/" },
      to: { path: "^src/(modulos|nucleo|integracoes)/", pathNot: "/infraestrutura/esquema[^/]*\\.ts$" },
    },
    {
      name: "sem-dependencias-orfas-em-modulos",
      comment: "Arquivo sem importadores e sem ser ponto de entrada geralmente e codigo morto.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: ["\\.d\\.ts$", "\\.teste\\.tsx?$", "publico\\.ts$", "^src/app/", "esquema[^/]*\\.ts$", "executor-linha-comando\\.ts$", "migrar\\.ts$", "^src/composicao/"],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
