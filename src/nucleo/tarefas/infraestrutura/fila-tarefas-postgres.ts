import { eq, sql } from "drizzle-orm";

import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";
import type { BancoDados } from "@/nucleo/banco-dados/publico";

import type { FilaTarefas, PedidoTarefa, Tarefa } from "../dominio/tarefa";
import { tarefas } from "./esquema";

/**
 * Fila de tarefas no PostgreSQL.
 *
 * `reservarProxima` usa `FOR UPDATE SKIP LOCKED`: cada executor trava a linha
 * que pegou e os demais pulam para a proxima, sem duplicar trabalho e sem
 * precisar de um servico de fila separado.
 */
export class FilaTarefasPostgres implements FilaTarefas {
  constructor(private readonly banco: BancoDados) {}

  async enfileirar(pedido: PedidoTarefa): Promise<string | null> {
    const inseridas = await this.banco
      .insert(tarefas)
      .values({
        tipo: pedido.tipo,
        dados: pedido.dados,
        agendadaPara: pedido.agendadaPara ?? new Date(),
        maximoTentativas: pedido.maximoTentativas ?? 5,
        chaveIdempotencia: pedido.chaveIdempotencia ?? null,
        organizacaoId: pedido.organizacaoId ?? null,
        empresaId: pedido.empresaId ?? null,
        usuarioId: pedido.usuarioId ?? null,
      })
      .onConflictDoNothing({ target: tarefas.chaveIdempotencia })
      .returning({ id: tarefas.id });
    return inseridas[0]?.id ?? null;
  }

  async reservarProxima(tipos?: readonly string[]): Promise<Tarefa | null> {
    return this.banco.transaction(async (transacao) => {
      const filtroTipos = tipos && tipos.length > 0 ? sql`AND tipo IN ${tipos}` : sql``;
      const linhas = await transacao.execute<typeof tarefas.$inferSelect>(sql`
        SELECT * FROM tarefas
        WHERE estado = 'pendente' AND agendada_para <= now() ${filtroTipos}
        ORDER BY agendada_para ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);
      const linha = linhas[0];
      if (!linha) return null;

      await transacao
        .update(tarefas)
        .set({ estado: "executando", iniciadaEm: new Date(), tentativas: sql`${tarefas.tentativas} + 1` })
        .where(eq(tarefas.id, linha.id));

      return converterLinha(linha);
    });
  }

  async marcarConcluida(id: string): Promise<void> {
    await this.banco
      .update(tarefas)
      .set({ estado: "concluida", concluidaEm: new Date(), ultimoErro: null })
      .where(eq(tarefas.id, id));
  }

  async marcarFalha(id: string, erro: string, reagendarEmMs: number): Promise<void> {
    await this.banco.execute(sql`
      UPDATE tarefas
      SET estado = CASE WHEN tentativas >= maximo_tentativas THEN 'falhou' ELSE 'pendente' END,
          agendada_para = now() + (${reagendarEmMs} || ' milliseconds')::interval,
          ultimo_erro = ${erro}
      WHERE id = ${id}
    `);
  }
}

function converterLinha(linha: typeof tarefas.$inferSelect): Tarefa {
  const tarefa: { -readonly [Chave in keyof Tarefa]?: Tarefa[Chave] } = {
    id: linha.id,
    tipo: linha.tipo,
    dados: linha.dados as Record<string, unknown>,
    estado: linha.estado as Tarefa["estado"],
    tentativas: linha.tentativas + 1,
    maximoTentativas: linha.maximoTentativas,
    // `execute` devolve datas como texto; normalizamos para Date.
    agendadaPara: new Date(linha.agendadaPara),
    criadaEm: new Date(linha.criadaEm),
  };
  if (linha.chaveIdempotencia) tarefa.chaveIdempotencia = linha.chaveIdempotencia;
  if (linha.organizacaoId) tarefa.organizacaoId = linha.organizacaoId as IdOrganizacao;
  if (linha.empresaId) tarefa.empresaId = linha.empresaId as IdEmpresa;
  if (linha.usuarioId) tarefa.usuarioId = linha.usuarioId as IdUsuario;
  return tarefa as Tarefa;
}
