/**
 * Reune os esquemas (definicoes de tabela) de todos os modulos para o Drizzle.
 *
 * Cada modulo e dono do seu esquema, que vive em `<modulo>/infraestrutura/esquema.ts`.
 * Este arquivo apenas os agrega para o drizzle-kit gerar migracoes e para a
 * conexao conhecer todas as tabelas. Mapa por categoria: `src/banco-dados/LEIA-ME.md`.
 */

// Tipos e enumeracoes compartilhados
export * from "./enumeracoes";

// Nucleo (plataforma)
export * from "@/nucleo/autenticacao/infraestrutura/esquema-better-auth";
export * from "@/nucleo/empresas/infraestrutura/esquema";
export * from "@/nucleo/auditoria/infraestrutura/esquema";
export * from "@/nucleo/eventos/infraestrutura/esquema";
export * from "@/nucleo/tarefas/infraestrutura/esquema";
export * from "@/nucleo/arquivos/infraestrutura/esquema";
export * from "@/nucleo/codigos/infraestrutura/esquema";

// Cadastros e classificacao
export * from "@/modulos/cadastros/infraestrutura/esquema";
export * from "@/modulos/plano-contas/infraestrutura/esquema";
export * from "@/modulos/centros-custo/infraestrutura/esquema";

// Bancos, movimentacoes, extratos e conciliacao
export * from "@/modulos/bancos/infraestrutura/esquema";
export * from "@/modulos/conciliacao-bancaria/infraestrutura/esquema";

// Operacao financeira
export * from "@/modulos/contas-pagar/infraestrutura/esquema";
export * from "@/modulos/contas-receber/infraestrutura/esquema";

// Tesouraria e controle gerencial
export * from "@/modulos/credito-dividas/infraestrutura/esquema";
export * from "@/modulos/orcamento/infraestrutura/esquema";
export * from "@/modulos/implantacao/infraestrutura/esquema";

// Captura de documentos por QR code (Gate 10)
export * from "@/modulos/captura-documentos/infraestrutura/esquema";
