"use client";

import { useActionState, useState } from "react";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { abatimentoDaBaixa, saldoRestante, valorQueMovimentaOBanco } from "@/compartilhado/financeiro/indice";
import { Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { FORMAS_DE_PAGAMENTO, NOMES_FORMA_PAGAMENTO } from "../../_apoio/formas-de-pagamento";
import { acaoRegistrarRecebimento, type EstadoFormulario } from "../acoes";
import estilos from "./formulario-recebimento.module.css";

const INICIAL: EstadoFormulario = {};

export interface ContaParaRecebimento {
  readonly parcelaId: string;
  readonly descricao: string;
  readonly saldoFormatado: string;
  readonly saldoCanonico: string;
  readonly contas: readonly { id: string; nome: string; saldoFormatado: string }[];
  readonly hoje: string;
}

function lerDinheiro(texto: string): Dinheiro {
  try {
    const limpo = texto.trim();
    return limpo ? Dinheiro.deTextoBrasileiro(limpo) : Dinheiro.zero();
  } catch {
    return Dinheiro.zero();
  }
}

/**
 * Registro de recebimento — acao que mexe em dinheiro de verdade.
 *
 * Por isso a confirmacao NAO pergunta "tem certeza?". Ela repete, em palavras,
 * exatamente o que vai acontecer: qual conta, quanto sai, de onde sai, em que
 * data, e qual saldo fica depois. Quem confirma sabe o que confirmou.
 *
 * OS TRES NUMEROS. Com juros, multa e desconto na mesma baixa, o valor que sai
 * do banco deixa de ser o mesmo que abate a conta — e essa diferenca e a fonte
 * classica de confusao ("paguei R$ 950, por que a conta consta quitada em
 * R$ 1.000?"). Em vez de explicar em texto de ajuda, a tela mostra os tres
 * numeros o tempo todo, recalculados a cada tecla, usando as MESMAS funcoes do
 * servidor.
 */
export function FormularioRecebimento({ conta }: { readonly conta: ContaParaRecebimento }) {
  const [estado, enviar, pendente] = useActionState(acaoRegistrarRecebimento, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const [confirmando, setConfirmando] = useState(false);
  const [valor, setValor] = useState(conta.saldoCanonico.replace(".", ","));
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [desconto, setDesconto] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState(conta.contas[0]?.id ?? "");
  const [data, setData] = useState(conta.hoje);

  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const contaEscolhida = conta.contas.find((c) => c.id === contaBancariaId);

  const saldo = lerDinheiro(conta.saldoCanonico.replace(".", ","));
  const principal = lerDinheiro(valor);
  const valorJuros = lerDinheiro(juros);
  const valorMulta = lerDinheiro(multa);
  const valorDesconto = lerDinheiro(desconto);

  const saiDoBanco = valorQueMovimentaOBanco(principal, valorJuros, valorMulta);
  const abate = abatimentoDaBaixa(principal, valorDesconto);
  const saldoDepois = saldoRestante({ valorOriginal: saldo, valorBaixado: abate });
  const passaDoSaldo = abate.maiorQue(saldo);
  const quita = !passaDoSaldo && saldoDepois.ehZero() && principal.ehPositivo();

  return (
    <form
      action={enviar}
      {...guardaEnviar}
      id="registrar-recebimento"
      onSubmit={(evento) => {
        guardaEnviar.onSubmit(evento);
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

      <CampoFormulario
        id="valorPrincipal"
        rotulo="Valor do recebimento (R$)"
        dica="A parte em dinheiro que abate a dívida. Não pode passar do saldo restante."
        obrigatorio
        {...erro("valorPrincipal")}
      >
        {(a) => (
          <ControleTexto {...a} name="valorPrincipal" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        )}
      </CampoFormulario>

      <CampoFormulario id="contaBancariaId" rotulo="Conta em que o dinheiro entra" obrigatorio {...erro("contaBancariaId")}>
        {(a) => (
          <select {...a} name="contaBancariaId" value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)}>
            {conta.contas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} · saldo {c.saldoFormatado}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="dataRecebimento" rotulo="Data do recebimento" obrigatorio {...erro("dataRecebimento")}>
        {(a) => <ControleTexto {...a} name="dataRecebimento" type="date" value={data} onChange={(e) => setData(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario id="formaPagamento" rotulo="Forma de recebimento" obrigatorio {...erro("formaPagamento")}>
        {(a) => (
          <select {...a} name="formaPagamento" defaultValue="pix">
            {FORMAS_DE_PAGAMENTO.map((forma) => (
              <option key={forma} value={forma}>{NOMES_FORMA_PAGAMENTO[forma]}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="valorJuros" rotulo="Juros (R$)" dica="Entra na conta, mas não abate o saldo.">
        {(a) => <ControleTexto {...a} name="valorJuros" type="text" inputMode="decimal" value={juros} onChange={(e) => setJuros(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario id="valorMulta" rotulo="Multa (R$)" dica="Entra na conta, mas não abate o saldo.">
        {(a) => <ControleTexto {...a} name="valorMulta" type="text" inputMode="decimal" value={multa} onChange={(e) => setMulta(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario
        id="valorDesconto"
        rotulo="Desconto (R$)"
        dica="Abate o saldo sem entrar dinheiro: é desconto concedido ao cliente."
        {...erro("valorDesconto")}
      >
        {(a) => (
          <ControleTexto {...a} name="valorDesconto" type="text" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
        )}
      </CampoFormulario>

      <dl className={estilos.contas} aria-live="polite">
        <div>
          <dt>Entra na conta bancária</dt>
          <dd className={estilos.numero}>{saiDoBanco.formatarBrasileiro()}</dd>
        </div>
        <div>
          <dt>Abate desta conta a receber</dt>
          <dd className={estilos.numero}>{abate.formatarBrasileiro()}</dd>
        </div>
        <div>
          <dt>Saldo depois</dt>
          <dd className={`${estilos.numero} ${passaDoSaldo ? estilos.alerta : ""}`}>
            {passaDoSaldo ? `Passa do saldo (${saldo.formatarBrasileiro()})` : saldoDepois.formatarBrasileiro()}
          </dd>
        </div>
      </dl>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Registrando...">
          Registrar recebimento
        </Botao>
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Confirmar recebimento"
        resumo={`Registrar recebimento de ${saiDoBanco.formatarBrasileiro()} para “${conta.descricao}”?`}
        impactos={[
          `Entra em: ${contaEscolhida?.nome ?? "conta não escolhida"}`,
          `Data do recebimento: ${data.split("-").reverse().join("/")}`,
          `Abate da conta a receber: ${abate.formatarBrasileiro()}`,
          ...(valorDesconto.ehPositivo()
            ? [`Desconto de ${valorDesconto.formatarBrasileiro()}: abate sem entrar dinheiro na conta.`]
            : []),
          ...(valorJuros.ehPositivo() || valorMulta.ehPositivo()
            ? [`Juros e multa de ${valorJuros.somar(valorMulta).formatarBrasileiro()}: entram na conta sem abater o saldo.`]
            : []),
          `Saldo atual da conta a receber: ${conta.saldoFormatado}`,
          `Saldo depois deste recebimento: ${saldoDepois.formatarBrasileiro()}`,
          quita ? "A conta ficará quitada." : "A conta continuará em aberto com o saldo restante.",
          "O lançamento entra no extrato da conta bancária e fica no histórico.",
        ]}
        rotuloConfirmar="Registrar recebimento"
        ocupado={pendente}
        aoConfirmar={() => {
          setConfirmando(false);
          (document.getElementById("registrar-recebimento") as HTMLFormElement | null)?.requestSubmit();
        }}
        aoCancelar={() => setConfirmando(false)}
      />
    </form>
  );
}
