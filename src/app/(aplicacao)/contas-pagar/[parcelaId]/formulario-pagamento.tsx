"use client";

import { useActionState, useState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao } from "@/interface/componentes/indice";

import { acaoRegistrarPagamento, type EstadoFormulario } from "../acoes";

const INICIAL: EstadoFormulario = {};

const FORMAS = [
  ["pix", "PIX"],
  ["boleto", "Boleto"],
  ["transferencia", "Transferência"],
  ["debito_automatico", "Débito automático"],
  ["cartao_credito", "Cartão de crédito"],
  ["cartao_debito", "Cartão de débito"],
  ["dinheiro", "Dinheiro"],
  ["cheque", "Cheque"],
  ["outro", "Outro"],
] as const;

export interface ContaParaPagamento {
  readonly parcelaId: string;
  readonly descricao: string;
  readonly saldoFormatado: string;
  readonly saldoCanonico: string;
  readonly contas: readonly { id: string; nome: string; saldoFormatado: string }[];
  readonly hoje: string;
}

/**
 * Registro de pagamento — acao que mexe em dinheiro de verdade.
 *
 * Por isso a confirmacao NAO pergunta "tem certeza?". Ela repete, em palavras,
 * exatamente o que vai acontecer: qual conta, quanto sai, de onde sai, em que
 * data, e qual saldo fica depois. Quem confirma sabe o que confirmou.
 */
export function FormularioPagamento({ conta }: { readonly conta: ContaParaPagamento }) {
  const [estado, enviar, pendente] = useActionState(acaoRegistrarPagamento, INICIAL);
  const [confirmando, setConfirmando] = useState(false);
  const [valor, setValor] = useState(conta.saldoCanonico.replace(".", ","));
  const [contaBancariaId, setContaBancariaId] = useState(conta.contas[0]?.id ?? "");
  const [data, setData] = useState(conta.hoje);

  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const contaEscolhida = conta.contas.find((c) => c.id === contaBancariaId);
  const numero = (texto: string): number => Number(texto.replace(/\./g, "").replace(",", ".")) || 0;
  const saldoDepois = Math.max(0, numero(conta.saldoCanonico.replace(".", ",")) - numero(valor));
  const formatar = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <form
      action={enviar}
      id="registrar-pagamento"
      onSubmit={(evento) => {
        // A confirmacao acontece antes do envio, nunca depois.
        if (!confirmando) {
          evento.preventDefault();
          setConfirmando(true);
        }
      }}
    >
      <input type="hidden" name="parcelaId" value={conta.parcelaId} />

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o valor e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="valorPrincipal" rotulo="Valor do pagamento (R$)" dica="Não pode passar do saldo restante." obrigatorio {...erro("valorPrincipal")}>
        {(a) => (
          <ControleTexto {...a} name="valorPrincipal" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        )}
      </CampoFormulario>

      <CampoFormulario id="contaBancariaId" rotulo="Conta de onde o dinheiro sai" obrigatorio {...erro("contaBancariaId")}>
        {(a) => (
          <select {...a} name="contaBancariaId" value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)}>
            {conta.contas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} · saldo {c.saldoFormatado}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="dataPagamento" rotulo="Data do pagamento" obrigatorio {...erro("dataPagamento")}>
        {(a) => <ControleTexto {...a} name="dataPagamento" type="date" value={data} onChange={(e) => setData(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario id="formaPagamento" rotulo="Forma de pagamento" obrigatorio {...erro("formaPagamento")}>
        {(a) => (
          <select {...a} name="formaPagamento" defaultValue="pix">
            {FORMAS.map(([valorForma, rotulo]) => (
              <option key={valorForma} value={valorForma}>{rotulo}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="valorJuros" rotulo="Juros (R$)" dica="Sai da conta, mas não abate o saldo.">
        {(a) => <ControleTexto {...a} name="valorJuros" type="text" inputMode="decimal" defaultValue="" />}
      </CampoFormulario>

      <CampoFormulario id="valorMulta" rotulo="Multa (R$)">
        {(a) => <ControleTexto {...a} name="valorMulta" type="text" inputMode="decimal" defaultValue="" />}
      </CampoFormulario>

      <CampoFormulario id="valorDesconto" rotulo="Desconto (R$)">
        {(a) => <ControleTexto {...a} name="valorDesconto" type="text" inputMode="decimal" defaultValue="" />}
      </CampoFormulario>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Registrando...">
          Registrar pagamento
        </Botao>
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Confirmar pagamento"
        resumo={`Registrar pagamento de ${formatar(numero(valor))} para “${conta.descricao}”?`}
        impactos={[
          `Sai de: ${contaEscolhida?.nome ?? "conta não escolhida"}`,
          `Data do pagamento: ${data.split("-").reverse().join("/")}`,
          `Saldo atual da conta a pagar: ${conta.saldoFormatado}`,
          `Saldo depois deste pagamento: ${formatar(saldoDepois)}`,
          saldoDepois === 0 ? "A conta ficará quitada." : "A conta continuará em aberto com o saldo restante.",
          "O lançamento entra no extrato da conta bancária e fica no histórico.",
        ]}
        rotuloConfirmar="Registrar pagamento"
        ocupado={pendente}
        aoConfirmar={() => {
          setConfirmando(false);
          (document.getElementById("registrar-pagamento") as HTMLFormElement | null)?.requestSubmit();
        }}
        aoCancelar={() => setConfirmando(false)}
      />
    </form>
  );
}
