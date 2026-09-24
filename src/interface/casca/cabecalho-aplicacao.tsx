"use client";

import { useEffect, useRef } from "react";

import { Logotipo } from "../marca/logotipo";
import estilos from "./cabecalho-aplicacao.module.css";

export interface EmpresaDoCabecalho {
  readonly id: string;
  readonly nome: string;
}

export interface CabecalhoAplicacaoProps {
  readonly nomeDaEmpresa: string;
  readonly nomeDoUsuario: string;
  /** Papel na empresa ativa; mostrado para explicar acoes ausentes. */
  readonly papelDoUsuario: string;
  /** Empresas que o usuario pode ativar. Com mais de uma, o seletor aparece. */
  readonly empresas?: readonly EmpresaDoCabecalho[];
  readonly empresaAtivaId?: string;
  /** Server action que valida e grava a troca (recebe `empresaId` no FormData). */
  readonly aoTrocarEmpresa?: (formulario: FormData) => Promise<void>;
  /** Server action que encerra a sessao. */
  readonly aoSair?: () => Promise<void>;
}

/**
 * Cabecalho fixo: empresa ativa, busca e usuario.
 *
 * A busca e um formulario GET de verdade para `/busca`: funciona sem
 * JavaScript, e `Ctrl+K` (ou `Cmd+K`) leva o foco ate ela de qualquer tela,
 * como promete o texto do proprio campo.
 *
 * Nao ha botao de avisos: o sino da especificacao (docs/ux/navegacao.md) so
 * entra quando existir o painel de pontos de atencao. Um botao que parece
 * clicavel e nao faz nada ensina a pessoa a desconfiar da tela inteira — e
 * ocupava, no celular, a largura que fazia a pagina rolar para o lado.
 *
 * O seletor de empresa fica no primeiro lugar do cabecalho porque lancar na
 * empresa errada e o erro mais caro do produto (Carlos, BPO). A troca e um
 * formulario de verdade: funciona sem JavaScript; com JavaScript, envia ao
 * mudar a opcao. A validacao de acesso acontece no servidor.
 */
export function CabecalhoAplicacao({
  nomeDaEmpresa,
  nomeDoUsuario,
  papelDoUsuario,
  empresas = [],
  empresaAtivaId,
  aoTrocarEmpresa,
  aoSair,
}: CabecalhoAplicacaoProps) {
  const podeTrocar = empresas.length > 1 && aoTrocarEmpresa !== undefined;
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k" && campoBusca.current) {
        evento.preventDefault();
        campoBusca.current.focus();
        campoBusca.current.select();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <header className={estilos.cabecalho}>
      <span className={estilos.marca}>
        <Logotipo tamanho="pequeno" />
      </span>

      {podeTrocar ? (
        <form action={aoTrocarEmpresa} className={estilos.empresa}>
          <label className={estilos.rotuloEmpresa} htmlFor="empresa-ativa">
            Empresa
          </label>
          <span className={estilos.seletorEmpresa}>
            <select
              id="empresa-ativa"
              name="empresaId"
              className={estilos.selectEmpresa}
              defaultValue={empresaAtivaId}
              onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
            >
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
            <button type="submit" className={estilos.botaoTrocar}>
              Trocar
            </button>
          </span>
        </form>
      ) : (
        <div className={estilos.empresa} aria-label={`Empresa ativa: ${nomeDaEmpresa}`}>
          <span className={estilos.rotuloEmpresa}>Empresa</span>
          <span className={estilos.nomeEmpresa}>{nomeDaEmpresa}</span>
        </div>
      )}

      <form className={estilos.busca} role="search" action="/busca" method="get">
        <label className="apenas-leitor-de-tela" htmlFor="busca-global">
          Buscar conta, código, fornecedor, cliente ou CPF/CNPJ
        </label>
        <input
          ref={campoBusca}
          id="busca-global"
          name="q"
          type="search"
          className={estilos.campoBusca}
          placeholder="Buscar conta, fornecedor ou cliente (Ctrl+K)"
          enterKeyHint="search"
          autoComplete="off"
        />
      </form>

      <div className={estilos.usuario}>
        <span className={estilos.nomeUsuario}>{nomeDoUsuario}</span>
        <span className={estilos.papel}>{papelDoUsuario}</span>
      </div>

      {aoSair ? (
        <form action={aoSair}>
          <button type="submit" className={estilos.acao}>
            Sair
          </button>
        </form>
      ) : null}
    </header>
  );
}
