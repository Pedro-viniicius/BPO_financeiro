import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Configuracao do ESLint (verificador de estilo e erros comuns).
 *
 * As regras de FRONTEIRA entre modulos nao ficam aqui: estao em
 * `.dependency-cruiser.cjs` (executadas por `pnpm verificar:arquitetura`).
 * O ESLint cuida de qualidade de codigo; o dependency-cruiser cuida de arquitetura.
 */
const configuracao = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "src/banco-dados/migracoes/**", "docs/**", "scripts/**"],
  },
  {
    rules: {
      // Nomes de variaveis nao usadas comecam com "_" para sinalizar intencao.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Evita `any` escondendo erros em codigo financeiro.
      "@typescript-eslint/no-explicit-any": "error",
      // Proibe `Number(...)`/parseFloat em arquivos de dominio? Nao ha regra pronta;
      // a protecao monetaria e feita por tipos (`Dinheiro`) e revisao.
    },
  },
];

export default configuracao;
