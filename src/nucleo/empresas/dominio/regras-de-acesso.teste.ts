import { describe, expect, it } from "vitest";

import {
  NaoPodeAlterarOProprioAcesso,
  UltimoAdministrador,
  verificarAlteracaoDePapel,
  verificarDesativacao,
  type SituacaoDoAcesso,
} from "./regras-de-acesso";

/**
 * O que estas travas evitam, na pratica: a empresa ficar trancada fora do
 * proprio sistema. Sem nenhum administrador ativo nao ha como conceder
 * permissao a ninguem, e a saida vira mexer no banco — exatamente o que este
 * gate veio eliminar.
 */

const situacao = (extras: Partial<SituacaoDoAcesso> = {}): SituacaoDoAcesso => ({
  alvoUsuarioId: "alvo",
  alvoEhAdministradorAtivo: true,
  autorUsuarioId: "autor",
  administradoresAtivos: 2,
  ...extras,
});

describe("alteracao de papel", () => {
  it("recusa rebaixar o ULTIMO administrador ativo", () => {
    expect(() => verificarAlteracaoDePapel(situacao({ administradoresAtivos: 1 }), false)).toThrow(UltimoAdministrador);
  });

  it("aceita rebaixar quando ha outro administrador", () => {
    expect(() => verificarAlteracaoDePapel(situacao({ administradoresAtivos: 2 }), false)).not.toThrow();
  });

  it("ninguem retira a propria administracao, mesmo havendo outros administradores", () => {
    expect(() =>
      verificarAlteracaoDePapel(situacao({ alvoUsuarioId: "mesma-pessoa", autorUsuarioId: "mesma-pessoa", administradoresAtivos: 5 }), false),
    ).toThrow(NaoPodeAlterarOProprioAcesso);
  });

  it("PROMOVER nunca e recusado: acrescentar administrador nao tranca ninguem", () => {
    expect(() => verificarAlteracaoDePapel(situacao({ administradoresAtivos: 1 }), true)).not.toThrow();
    expect(() =>
      verificarAlteracaoDePapel(situacao({ alvoUsuarioId: "eu", autorUsuarioId: "eu", administradoresAtivos: 1 }), true),
    ).not.toThrow();
  });

  it("quem nao e administrador pode mudar de papel livremente", () => {
    expect(() =>
      verificarAlteracaoDePapel(situacao({ alvoEhAdministradorAtivo: false, administradoresAtivos: 1 }), false),
    ).not.toThrow();
  });
});

describe("desativacao", () => {
  it("recusa desativar o ULTIMO administrador ativo", () => {
    expect(() => verificarDesativacao(situacao({ administradoresAtivos: 1 }))).toThrow(UltimoAdministrador);
  });

  it("recusa desativar a si mesmo, sempre", () => {
    expect(() =>
      verificarDesativacao(situacao({ alvoUsuarioId: "eu", autorUsuarioId: "eu", administradoresAtivos: 9, alvoEhAdministradorAtivo: false })),
    ).toThrow(NaoPodeAlterarOProprioAcesso);
  });

  it("aceita desativar outra pessoa quando ha administrador sobrando", () => {
    expect(() => verificarDesativacao(situacao({ administradoresAtivos: 2 }))).not.toThrow();
  });

  it("aceita desativar quem nunca foi administrador", () => {
    expect(() => verificarDesativacao(situacao({ alvoEhAdministradorAtivo: false, administradoresAtivos: 1 }))).not.toThrow();
  });
});
