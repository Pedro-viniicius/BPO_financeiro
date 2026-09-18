import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Identificadores UUID gerados pelo banco (configuracao `generateId: "uuid"` do Better Auth). */
const idUuid = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);

/**
 * Tabelas exigidas pelo Better Auth (biblioteca de autenticacao).
 *
 * VOCABULARIO EXTERNO MANTIDO DE PROPOSITO: os nomes das tabelas e colunas
 * (`user`, `session`, `account`, `verification`, `two_factor`) seguem a
 * convencao da biblioteca para que atualizacoes e plugins funcionem sem
 * mapeamentos fragilizados. Ver ADR-006.
 *
 * O que cada tabela guarda:
 * - user         -> a pessoa (identidade). Nosso `IdUsuario` e o `user.id`.
 * - session      -> sessoes ativas (token, validade, IP, navegador).
 * - account      -> credenciais por provedor: senha (hash) ou Google (OAuth).
 * - verification -> tokens temporarios (confirmar e-mail, redefinir senha).
 * - two_factor   -> segredo TOTP e codigos de recuperacao (criptografados pela biblioteca).
 *
 * Tudo que e nosso (vinculo com empresa, papel, permissoes) fica em
 * `nucleo/empresas` e referencia `user.id`.
 */
export const user = pgTable("user", {
  id: idUuid(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: idUuid(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (tabela) => [index("session_user_id_idx").on(tabela.userId)],
);

export const account = pgTable(
  "account",
  {
    id: idUuid(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("account_user_id_idx").on(tabela.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: idUuid(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("verification_identifier_idx").on(tabela.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: idUuid(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Se a configuracao TOTP foi confirmada pelo usuario. */
    verified: boolean("verified").notNull().default(true),
    /** Tentativas erradas seguidas; usado para bloqueio temporario. */
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (tabela) => [index("two_factor_user_id_idx").on(tabela.userId)],
);
