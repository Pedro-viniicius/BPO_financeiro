import type { NextConfig } from "next";

/**
 * Configuracao do Next.js.
 *
 * - `output: "standalone"` gera uma pasta autocontida usada pelo Dockerfile
 *   (Modelos de deploy B e C). Na Vercel (Modelo A) ele e omitido: a propria
 *   plataforma empacota as funcoes, e `standalone` atrapalharia esse pipeline.
 * - Os cabecalhos de seguranca sao definidos aqui para valerem em qualquer
 *   hospedagem, sem depender de proxy externo. Ver docs/seguranca/modelo-seguranca.md.
 *   A `Content-Security-Policy` NAO esta nesta lista: ela leva um nonce por
 *   requisicao e por isso nasce em `src/proxy.ts`.
 */
const cabecalhosSeguranca = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const configuracao: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  poweredByHeader: false,
  reactStrictMode: true,
  // Habilita `forbidden()`, usado pela guarda de autorizacao do servidor para
  // devolver 403 de verdade em vez de redirecionar ou estourar 500. Ver ADR-026.
  experimental: { authInterrupts: true },
  async headers() {
    return [
      { source: "/(.*)", headers: cabecalhosSeguranca },
      {
        /*
         * A URL de envio carrega o token da empresa. `no-referrer` impede que
         * ele vaze no Referer para qualquer destino — e `no-store` que fique
         * em cache compartilhado. Sao os unicos cabecalhos que diferem do
         * restante do site.
         */
        source: "/enviar/:caminho*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        /*
         * O recebimento do envio publico e a unica rota fora do proxy (que
         * gera a CSP com nonce): o corpo de ate 40 MB nao pode passar pelo
         * limite de 10 MB do proxy. Ela nao devolve HTML — so redireciona ou
         * responde texto —, entao a politica aqui e estatica e fechada.
         */
        source: "/enviar/:token/receber",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
};

export default configuracao;
