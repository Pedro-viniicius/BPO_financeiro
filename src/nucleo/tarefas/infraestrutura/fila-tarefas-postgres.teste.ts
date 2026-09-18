import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as esquema from "@/banco-dados/esquemas/indice";
import { EntregadorEventosSaida, PublicadorEventosSaida, type EventoDominio } from "@/nucleo/eventos/publico";

import { ExecutorTarefas } from "../aplicacao/executor-tarefas";
import { FilaTarefasPostgres } from "./fila-tarefas-postgres";

/**
 * Teste de integracao com PostgreSQL real.
 * Roda apenas quando `BANCO_URL_TESTE` esta definida (banco de testes com
 * migracoes aplicadas). Na CI, o servico de banco e configurado no Gate 5.
 */
const urlTeste = process.env.BANCO_URL_TESTE;

describe.skipIf(!urlTeste)("FilaTarefasPostgres e outbox (integracao)", () => {
  const cliente = postgres(urlTeste ?? "", { max: 2 });
  const banco = drizzle(cliente, { schema: esquema, casing: "snake_case" });
  const logsSilenciosos = { info: () => undefined, erro: () => undefined };

  beforeAll(async () => {
    await banco.execute(sql`DELETE FROM tarefas WHERE tipo LIKE 'teste.%'`);
    await banco.execute(sql`DELETE FROM eventos_saida WHERE nome LIKE 'teste.%'`);
  });

  afterAll(async () => {
    await cliente.end();
  });

  it("enfileira, reserva com SKIP LOCKED, executa e conclui", async () => {
    const fila = new FilaTarefasPostgres(banco);
    const id = await fila.enfileirar({ tipo: "teste.ok", dados: { valor: 42 }, chaveIdempotencia: `teste-ok-${Date.now()}` });
    expect(id).toBeTruthy();

    const executor = new ExecutorTarefas(fila, logsSilenciosos);
    const recebidos: unknown[] = [];
    executor.registrar({ tipo: "teste.ok", executar: async (t) => void recebidos.push(t.dados.valor) });

    expect(await executor.executarProxima()).toBe(true);
    expect(recebidos).toEqual([42]);
    expect(await executor.executarProxima()).toBe(false);

    const [linha] = await banco.execute<{ estado: string; tentativas: number }>(
      sql`SELECT estado, tentativas FROM tarefas WHERE id = ${id}`,
    );
    expect(linha).toMatchObject({ estado: "concluida", tentativas: 1 });
  });

  it("respeita a chave de idempotencia", async () => {
    const fila = new FilaTarefasPostgres(banco);
    const chave = `teste-dup-${Date.now()}`;
    expect(await fila.enfileirar({ tipo: "teste.dup", dados: {}, chaveIdempotencia: chave })).toBeTruthy();
    expect(await fila.enfileirar({ tipo: "teste.dup", dados: {}, chaveIdempotencia: chave })).toBeNull();
  });

  it("reagenda falhas e marca como falhou ao esgotar tentativas", async () => {
    const fila = new FilaTarefasPostgres(banco);
    const id = await fila.enfileirar({ tipo: "teste.falha", dados: {}, maximoTentativas: 1 });
    const executor = new ExecutorTarefas(fila, logsSilenciosos);
    executor.registrar({
      tipo: "teste.falha",
      executar: async () => {
        throw new Error("erro proposital");
      },
    });
    expect(await executor.executarProxima()).toBe(true);
    const [linha] = await banco.execute<{ estado: string; ultimo_erro: string }>(
      sql`SELECT estado, ultimo_erro FROM tarefas WHERE id = ${id}`,
    );
    expect(linha).toMatchObject({ estado: "falhou", ultimo_erro: "erro proposital" });
  });

  it("grava evento na outbox dentro da transacao e entrega depois", async () => {
    const nome = `teste.evento_${Date.now()}`;
    await banco.transaction(async (transacao) => {
      const publicador = new PublicadorEventosSaida(transacao);
      await publicador.publicar({ nome, ocorridoEm: new Date(), dados: { contaId: "abc" } });
    });

    const entregues: EventoDominio[] = [];
    const entregador = new EntregadorEventosSaida(banco);
    entregador.registrar({ nomeEvento: nome, tratar: async (evento) => void entregues.push(evento) });

    expect(await entregador.entregarPendentes()).toBeGreaterThanOrEqual(1);
    expect(entregues.map((e) => e.dados)).toContainEqual({ contaId: "abc" });

    // Segunda passada nao entrega de novo.
    entregues.length = 0;
    await entregador.entregarPendentes();
    expect(entregues).toEqual([]);
  });

  it("evento cuja entrega falha permanece pendente com o erro registrado", async () => {
    const nome = `teste.evento_falha_${Date.now()}`;
    await new PublicadorEventosSaida(banco).publicar({ nome, ocorridoEm: new Date(), dados: {} });
    const entregador = new EntregadorEventosSaida(banco);
    entregador.registrar({
      nomeEvento: nome,
      tratar: async () => {
        throw new Error("manipulador quebrado");
      },
    });
    await entregador.entregarPendentes();
    const [linha] = await banco.execute<{ tentativas: number; ultimo_erro: string; publicado_em: string | null }>(
      sql`SELECT tentativas, ultimo_erro, publicado_em FROM eventos_saida WHERE nome = ${nome}`,
    );
    expect(linha).toMatchObject({ tentativas: 1, ultimo_erro: "manipulador quebrado", publicado_em: null });
  });
});
