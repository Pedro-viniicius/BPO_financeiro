"use client";

import { useActionState, useState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";

import { acaoEditarContaBancaria, type EstadoFormulario } from "../acoes";
import { NOMES_TIPO_CONTA, TIPOS_DE_CONTA } from "../tipos-de-conta";
import estilos from "./formulario-edicao.module.css";

const INICIAL: EstadoFormulario = {};

export interface ContaParaEdicao {
  readonly contaId: string;
  readonly nome: string;
  readonly tipo: string;
  readonly instituicaoNome: string | null;
  readonly agencia: string | null;
  readonly numeroConta: string | null;
  readonly saldoInicialCanonico: string;
  readonly saldoInicialFormatado: string;
  readonly dataSaldoInicial: string;
  readonly saldoInicialEditavel: boolean;
}

/**
 * Edicao de uma conta bancaria.
 *
 * O campo do banco aparece e some conforme o tipo, porque o modelo exige
 * exatamente isso: `caixa` nao pode ter instituicao, e todo o resto precisa.
 *
 * O SALDO INICIAL some assim que existe a primeira movimentacao. Ele deixa de
 * ser um dado do cadastro e passa a ser a base de todo o historico: muda-lo
 * recalcularia em silencio meses ja conferidos. No lugar dele fica a
 * explicacao e o caminho certo — o lancamento de ajuste, logo acima.
 */
export function FormularioEdicaoConta({ conta }: { readonly conta: ContaParaEdicao }) {
  const [estado, enviar, pendente] = useActionState(acaoEditarContaBancaria, INICIAL);
  const [tipo, setTipo] = useState(conta.tipo);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const ehCaixa = tipo === "caixa";

  return (
    <form action={enviar}>
      <input type="hidden" name="contaId" value={conta.contaId} />

      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <CampoFormulario id="nomeConta" rotulo="Nome da conta" obrigatorio {...erro("nome")}>
        {(a) => <ControleTexto {...a} name="nome" type="text" defaultValue={conta.nome} />}
      </CampoFormulario>

      <CampoFormulario id="tipoConta" rotulo="Tipo" obrigatorio {...erro("tipo")}>
        {(a) => (
          <select {...a} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DE_CONTA.map((valor) => (
              <option key={valor} value={valor}>{NOMES_TIPO_CONTA[valor]}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      {ehCaixa ? null : (
        <>
          <CampoFormulario id="instituicaoNome" rotulo="Banco" obrigatorio {...erro("instituicaoNome")}>
            {(a) => <ControleTexto {...a} name="instituicaoNome" type="text" defaultValue={conta.instituicaoNome ?? ""} />}
          </CampoFormulario>

          <CampoFormulario id="agencia" rotulo="Agência">
            {(a) => <ControleTexto {...a} name="agencia" type="text" inputMode="numeric" defaultValue={conta.agencia ?? ""} />}
          </CampoFormulario>

          <CampoFormulario id="numeroConta" rotulo="Número da conta">
            {(a) => <ControleTexto {...a} name="numeroConta" type="text" inputMode="numeric" defaultValue={conta.numeroConta ?? ""} />}
          </CampoFormulario>
        </>
      )}

      {conta.saldoInicialEditavel ? (
        <>
          <CampoFormulario
            id="saldoInicial"
            rotulo="Saldo inicial (R$)"
            dica="Ainda pode ser corrigido porque esta conta não tem lançamento nenhum."
            {...erro("saldoInicial")}
          >
            {(a) => (
              <ControleTexto
                {...a}
                name="saldoInicial"
                type="text"
                inputMode="decimal"
                defaultValue={conta.saldoInicialCanonico.replace(".", ",")}
              />
            )}
          </CampoFormulario>

          <CampoFormulario id="dataSaldoInicial" rotulo="Data do saldo inicial" obrigatorio {...erro("dataSaldoInicial")}>
            {(a) => <ControleTexto {...a} name="dataSaldoInicial" type="date" defaultValue={conta.dataSaldoInicial} />}
          </CampoFormulario>
        </>
      ) : (
        <div className={estilos.bloqueado}>
          <span className={estilos.bloqueadoRotulo}>Saldo inicial</span>
          <span className={estilos.bloqueadoValor}>
            {conta.saldoInicialFormatado} em {conta.dataSaldoInicial.split("-").reverse().join("/")}
          </span>
          <span className={estilos.bloqueadoMotivo}>
            Esta conta já tem lançamentos. O saldo inicial é a base de todo o histórico, então mudá-lo recalcularia meses já
            conferidos. Para corrigir o saldo de hoje, registre um lançamento de ajuste.
          </span>
          <input type="hidden" name="dataSaldoInicial" value={conta.dataSaldoInicial} />
        </div>
      )}

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar alterações
        </Botao>
      </p>
    </form>
  );
}
