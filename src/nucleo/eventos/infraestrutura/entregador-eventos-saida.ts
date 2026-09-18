import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";

import type { IdEmpresa, IdOrganizacao, IdUsuario } from "@/compartilhado/tipos/identificadores";
import type { BancoDados } from "@/nucleo/banco-dados/publico";

import type { EventoDominio, ManipuladorEvento } from "../dominio/evento-dominio";
import { eventosSaida } from "./esquema";

const MAXIMO_TENTATIVAS = 10;

type LinhaEventoSaida = typeof eventosSaida.$inferSelect;

function converterLinhaEmEvento(linha: LinhaEventoSaida): EventoDominio {
  const evento: {
    -readonly [Chave in keyof EventoDominio]?: EventoDominio[Chave];
  } = {
    nome: linha.nome,
    ocorridoEm: linha.ocorridoEm,
    dados: linha.dados as Record<string, unknown>,
  };
  if (linha.organizacaoId) evento.organizacaoId = linha.organizacaoId as IdOrganizacao;
  if (linha.empresaId) evento.empresaId = linha.empresaId as IdEmpresa;
  if (linha.usuarioId) evento.usuarioId = linha.usuarioId as IdUsuario;
  return evento as EventoDominio;
}

/**
 * Le eventos ainda nao publicados e entrega a cada manipulador registrado.
 *
 * Executado periodicamente por uma tarefa (`eventos.publicar_saida`).
 * Garantia: entrega "ao menos uma vez". Manipuladores precisam tolerar
 * receber o mesmo evento duas vezes (idempotencia) — ex.: verificar se a
 * movimentacao ja existe antes de criar.
 */
export class EntregadorEventosSaida {
  private readonly manipuladores = new Map<string, ManipuladorEvento[]>();

  constructor(private readonly banco: BancoDados) {}

  registrar(manipulador: ManipuladorEvento): void {
    const lista = this.manipuladores.get(manipulador.nomeEvento) ?? [];
    lista.push(manipulador);
    this.manipuladores.set(manipulador.nomeEvento, lista);
  }

  /** Processa um lote de eventos pendentes. Devolve quantos foram entregues. */
  async entregarPendentes(tamanhoLote = 50): Promise<number> {
    const pendentes = await this.banco
      .select()
      .from(eventosSaida)
      .where(and(isNull(eventosSaida.publicadoEm), lt(eventosSaida.tentativas, MAXIMO_TENTATIVAS)))
      .orderBy(asc(eventosSaida.ocorridoEm))
      .limit(tamanhoLote);

    let entregues = 0;
    for (const linha of pendentes) {
      const evento = converterLinhaEmEvento(linha);
      try {
        for (const manipulador of this.manipuladores.get(evento.nome) ?? []) {
          await manipulador.tratar(evento);
        }
        await this.banco
          .update(eventosSaida)
          .set({ publicadoEm: new Date(), ultimoErro: null })
          .where(eq(eventosSaida.id, linha.id));
        entregues += 1;
      } catch (erro) {
        await this.banco
          .update(eventosSaida)
          .set({
            tentativas: sql`${eventosSaida.tentativas} + 1`,
            ultimoErro: erro instanceof Error ? erro.message : String(erro),
          })
          .where(eq(eventosSaida.id, linha.id));
      }
    }
    return entregues;
  }
}
