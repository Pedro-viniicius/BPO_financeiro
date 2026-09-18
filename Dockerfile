# ============================================================================
# Imagem da aplicacao Financeiro (Modelos de deploy B e C).
# Multi-etapa: instala dependencias, compila e gera uma imagem final enxuta.
# ============================================================================

# --- Etapa 1: dependencias --------------------------------------------------
FROM node:22-alpine AS dependencias
WORKDIR /aplicacao
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# --- Etapa 2: build ---------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /aplicacao
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
COPY --from=dependencias /aplicacao/node_modules ./node_modules
COPY . .
# Valores fictícios apenas para o build (validacao das variaveis acontece em tempo de execucao).
ENV BANCO_URL=postgres://build:build@localhost:5432/build \
    APLICACAO_URL=http://localhost:3000 \
    APLICACAO_SEGREDO=segredo-apenas-para-build-0123456789abcdef
RUN pnpm build

# --- Etapa 3: imagem final --------------------------------------------------
FROM node:22-alpine AS final
WORKDIR /aplicacao
ENV NODE_ENV=production
RUN addgroup -S financeiro && adduser -S financeiro -G financeiro

# Saida "standalone" do Next.js: contem apenas o necessario para rodar.
COPY --from=build --chown=financeiro:financeiro /aplicacao/.next/standalone ./
COPY --from=build --chown=financeiro:financeiro /aplicacao/.next/static ./.next/static
# Migracoes e executor de tarefas (rodam com tsx a partir do codigo-fonte).
COPY --from=build --chown=financeiro:financeiro /aplicacao/src ./src
COPY --from=build --chown=financeiro:financeiro /aplicacao/node_modules ./node_modules
COPY --from=build --chown=financeiro:financeiro /aplicacao/package.json /aplicacao/tsconfig.json /aplicacao/drizzle.config.ts ./

USER financeiro
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/api/saude || exit 1
CMD ["node", "server.js"]
