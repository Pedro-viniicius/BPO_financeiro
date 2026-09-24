"use client";

import { useActionState, useState } from "react";

import { CampoDinheiro, Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";

import { acaoCriarContaBancaria, type EstadoFormulario } from "./acoes";

const INICIAL: EstadoFormulario = {};

const TIPOS = [
  ["conta_corrente", "Conta corrente"],
  ["conta_poupanca", "Conta poupança"],
  ["conta_pagamento", "Conta de pagamento"],
  ["aplicacao", "Aplicação"],
  ["caixa", "Caixa (dinheiro em espécie)"],
] as const;

/**
 * Nova conta bancaria.
 *
 * O campo do banco aparece e some conforme o tipo, porque o modelo exige
 * exatamente isso: `caixa` nao pode ter instituicao, e todo o resto precisa.
 * Mostrar o campo sempre levaria a pessoa a preencher algo que seria recusado.
 */
export function FormularioContaBancaria({ hoje }: { readonly hoje: string }) {
  const [estado, enviar, pendente] = useActionState(acaoCriarContaBancaria, INICIAL);
  const [tipo, setTipo] = useState<string>("conta_corrente");
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const ehCaixa = tipo === "caixa";

  return (
    <form action={enviar}>
      {estado.sucesso ? <Aviso tom="sucesso" titulo={estado.sucesso} /> : null}
      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <CampoFormulario id="nomeConta" rotulo="Nome da conta" dica="Como você chama essa conta no dia a dia." obrigatorio {...erro("nome")}>
        {(a) => <ControleTexto {...a} name="nome" type="text" placeholder="Banco do Brasil — movimento" />}
      </CampoFormulario>

      <CampoFormulario id="tipo" rotulo="Tipo" obrigatorio {...erro("tipo")}>
        {(a) => (
          <select {...a} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      {ehCaixa ? null : (
        <>
          <CampoFormulario id="instituicaoNome" rotulo="Banco" dica="Se ainda não estiver na lista, será criado." obrigatorio {...erro("instituicaoNome")}>
            {(a) => <ControleTexto {...a} name="instituicaoNome" type="text" placeholder="Banco do Brasil" />}
          </CampoFormulario>

          <CampoFormulario id="agencia" rotulo="Agência">
            {(a) => <ControleTexto {...a} name="agencia" type="text" inputMode="numeric" />}
          </CampoFormulario>

          <CampoFormulario id="numeroConta" rotulo="Número da conta">
            {(a) => <ControleTexto {...a} name="numeroConta" type="text" inputMode="numeric" />}
          </CampoFormulario>
        </>
      )}

      <CampoFormulario
        id="saldoInicial"
        rotulo="Saldo inicial (R$)"
        dica="O saldo na data abaixo. Depois disso, o saldo é calculado pelas movimentações."
        {...erro("saldoInicial")}
      >
        {(a) => <CampoDinheiro {...a} id="saldoInicial" name="saldoInicial" valor="" />}
      </CampoFormulario>

      <CampoFormulario id="dataSaldoInicial" rotulo="Data do saldo inicial" obrigatorio {...erro("dataSaldoInicial")}>
        {(a) => <ControleTexto {...a} name="dataSaldoInicial" type="date" defaultValue={hoje} />}
      </CampoFormulario>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Cadastrar conta
        </Botao>
      </p>
    </form>
  );
}
