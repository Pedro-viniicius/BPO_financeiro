import type { NextConfig } from "next";

/**
 * Configuracao do Next.js.
 *
 * - `output: "standalone"` gera uma pasta autocontida usada pelo Dockerfile
 *   (Modelos de deploy B e C). Nao afeta o Modelo A.
 * - Os cabecalhos de seguranca sao definidos aqui para valerem em qualquer
 *   hospedagem, sem depender de proxy externo. Ver docs/seguranca/modelo-seguranca.md.
 */
const cabecalhosSeguranca = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const configuracao: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: cabecalhosSeguranca }];
  },
};

export default configuracao;
