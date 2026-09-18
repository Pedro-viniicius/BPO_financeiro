import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { criarBancoTeste, ERRO_POSTGRES, esperarErroPostgres, urlBancoTeste } from "./apoio-testes-banco";

/**
 * Menor privilegio: a conexao de teste usa o usuario da APLICACAO
 * (financeiro_aplicacao). Ele pode ler/escrever dados, mas nao alterar
 * estrutura nem mexer na auditoria. Se BANCO_URL_TESTE apontar para um
 * superusuario (ex.: desenvolvimento local sem os papeis), os testes de
 * privilegio sao pulados com aviso.
 */
describe.skipIf(!urlBancoTeste)("privilegios do usuario da aplicacao (PostgreSQL real)", () => {
  const { banco, cliente } = criarBancoTeste(2);
  afterAll(async () => cliente.end());

  async function ehSuperusuario(): Promise<boolean> {
    const [linha] = await banco.execute<{ rolsuper: boolean }>(sql`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`);
    return Boolean(linha?.rolsuper);
  }

  it("nao pode criar tabelas (DDL)", async () => {
    if (await ehSuperusuario()) return;
    await esperarErroPostgres(banco, () => banco.execute(sql`CREATE TABLE tabela_proibida (id int)`), ERRO_POSTGRES.privilegioInsuficiente);
  });

  it("insere na auditoria, mas nao altera nem apaga", async () => {
    if (await ehSuperusuario()) return;
    const [inserido] = await banco.execute<{ id: string }>(
      sql`INSERT INTO eventos_auditoria (acao, entidade, origem) VALUES ('teste.privilegio', 'teste', 'sistema') RETURNING id`,
    );
    expect(inserido?.id).toBeTruthy();
    await esperarErroPostgres(banco,
      () => banco.execute(sql`UPDATE eventos_auditoria SET acao = 'alterado' WHERE id = ${inserido!.id}`),
      ERRO_POSTGRES.privilegioInsuficiente,
    );
    await esperarErroPostgres(banco,
      () => banco.execute(sql`DELETE FROM eventos_auditoria WHERE id = ${inserido!.id}`),
      ERRO_POSTGRES.privilegioInsuficiente,
    );
  });

  it("nao pode desativar o gatilho da auditoria", async () => {
    if (await ehSuperusuario()) return;
    await esperarErroPostgres(banco,
      () => banco.execute(sql`ALTER TABLE eventos_auditoria DISABLE TRIGGER auditoria_somente_insercao`),
      ERRO_POSTGRES.privilegioInsuficiente,
    );
  });
});
