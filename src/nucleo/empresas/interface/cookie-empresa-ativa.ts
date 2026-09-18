import { cookies } from "next/headers";

import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";

/**
 * Cookie que LEMBRA a empresa escolhida. E preferencia, nao prova: quem le
 * (`resolverContextoAplicacao`) confere contra as empresas acessiveis do
 * usuario a cada requisicao. `HttpOnly` para nao virar brinquedo de script;
 * `SameSite=Lax` como os cookies de sessao.
 */
export const NOME_COOKIE_EMPRESA_ATIVA = "financeiro.empresa-ativa";

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365;

export async function lerPreferenciaEmpresaAtiva(): Promise<string | undefined> {
  const armazem = await cookies();
  return armazem.get(NOME_COOKIE_EMPRESA_ATIVA)?.value;
}

/** So deve ser chamado depois de validar que a empresa e acessivel ao usuario. */
export async function gravarPreferenciaEmpresaAtiva(empresaId: string): Promise<void> {
  const armazem = await cookies();
  armazem.set(NOME_COOKIE_EMPRESA_ATIVA, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: obterVariaveisAmbiente().AMBIENTE === "producao",
    path: "/",
    maxAge: UM_ANO_EM_SEGUNDOS,
  });
}

export async function apagarPreferenciaEmpresaAtiva(): Promise<void> {
  const armazem = await cookies();
  armazem.delete(NOME_COOKIE_EMPRESA_ATIVA);
}
