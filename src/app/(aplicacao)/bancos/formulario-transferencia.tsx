"use client";

import { useActionState, useState } from "react";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { Dobra, Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoCriarTransferencia, acaoEstornarTransferencia, type EstadoFormulario } from "./acoes";
import estilos from "./transferencia.module.css";

const INICIAL: EstadoFormulario = {};

export interface ContaParaTransferir {
  readonly id: string;
  readonly nome: string;
  readonly saldoFormatado: string;
  readonly saldoCanonico: string;
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
 * Transferencia entre contas proprias.
 *
 * A confirmacao mostra os saldos das DUAS contas antes e depois. Transferir e
 * a operacao em que mais se erra a direcao — e o erro so aparece quando uma
 * das contas fica negativa, dias depois.
 *
 * O aviso de saldo insuficiente e informativo, nao bloqueia: conta corrente
 * tem limite, e o sistema nao sabe qual e. Quem decide e quem conhece a conta.
 */
export function FormularioTransferencia({
  contas,
  hoje,
}: {
  readonly contas: readonly ContaParaTransferir[];
  readonly hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoCriarTransferencia, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const [confirmando, setConfirmando] = useState(false);
  const [origemId, setOrigemId] = useState(contas[0]?.id ?? "");
  const [destinoId, setDestinoId] = useState(contas[1]?.id ?? "");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState("");

  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const origem = contas.find((c) => c.id === origemId);
  const destino = contas.find((c) => c.id === destinoId);
  const quantia = lerDinheiro(valor);

  const saldoOrigemDepois = origem ? lerDinheiro(origem.saldoCanonico.replace(".", ",")).subtrair(quantia) : Dinheiro.zero();
  const saldoDestinoDepois = destino ? lerDinheiro(destino.saldoCanonico.replace(".", ",")).somar(quantia) : Dinheiro.zero();
  const mesmaConta = origemId === destinoId;

  return (
    <form
      action={enviar}
      {...guardaEnviar}
      id="nova-transferencia"
      onSubmit={(evento) => {
        guardaEnviar.onSubmit(evento);
        if (!confirmando) {
          evento.preventDefault();
          setConfirmando(true);
        }
      }}
    >
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="contaOrigemId" rotulo="Sai de" obrigatorio {...erro("contaOrigemId")}>
        {(a) => (
          <select {...a} name="contaOrigemId" value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.nome} · saldo {conta.saldoFormatado}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="contaDestinoId" rotulo="Entra em" obrigatorio {...erro("contaDestinoId")}>
        {(a) => (
          <select {...a} name="contaDestinoId" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.nome} · saldo {conta.saldoFormatado}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      {mesmaConta ? (
        <Aviso tom="atencao" titulo="Escolha duas contas diferentes">
          Transferir de uma conta para ela mesma não move dinheiro nenhum.
        </Aviso>
      ) : null}

      <CampoFormulario id="valorTransferencia" rotulo="Valor (R$)" dica="Use vírgula para os centavos." obrigatorio {...erro("valor")}>
        {(a) => (
          <ControleTexto {...a} name="valor" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        )}
      </CampoFormulario>

      <CampoFormulario id="dataTransferencia" rotulo="Data" obrigatorio {...erro("data")}>
        {(a) => <ControleTexto {...a} name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario id="descricaoTransferencia" rotulo="Descrição" dica="Opcional. Aparece no extrato das duas contas.">
        {(a) => (
          <ControleTexto {...a} name="descricao" type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        )}
      </CampoFormulario>

      <dl className={estilos.contas} aria-live="polite">
        <div>
          <dt>{origem?.nome ?? "Origem"} depois</dt>
          <dd className={`${estilos.numero} ${saldoOrigemDepois.ehNegativo() ? estilos.alerta : ""}`}>
            {saldoOrigemDepois.formatarBrasileiro()}
          </dd>
        </div>
        <div>
          <dt>{destino?.nome ?? "Destino"} depois</dt>
          <dd className={estilos.numero}>{saldoDestinoDepois.formatarBrasileiro()}</dd>
        </div>
      </dl>

      {saldoOrigemDepois.ehNegativo() ? (
        <Aviso tom="atencao" titulo="A conta de origem fica negativa">
          Se ela tem limite, tudo bem. O sistema não sabe qual é o limite — quem decide é você.
        </Aviso>
      ) : null}

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Transferindo..." disabled={mesmaConta}>
          Transferir
        </Botao>
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Confirmar transferência"
        resumo={`Transferir ${quantia.formatarBrasileiro()} de “${origem?.nome ?? "?"}” para “${destino?.nome ?? "?"}”?`}
        impactos={[
          `Sai de ${origem?.nome ?? "?"}: ${origem?.saldoFormatado ?? "?"} → ${saldoOrigemDepois.formatarBrasileiro()}`,
          `Entra em ${destino?.nome ?? "?"}: ${destino?.saldoFormatado ?? "?"} → ${saldoDestinoDepois.formatarBrasileiro()}`,
          `Data: ${data.split("-").reverse().join("/")}`,
          "Não é receita nem despesa: não entra nos relatórios de resultado.",
          "Aparece no extrato das duas contas e pode ser estornada.",
        ]}
        rotuloConfirmar="Transferir"
        ocupado={pendente}
        aoConfirmar={() => {
          setConfirmando(false);
          (document.getElementById("nova-transferencia") as HTMLFormElement | null)?.requestSubmit();
        }}
        aoCancelar={() => setConfirmando(false)}
      />
    </form>
  );
}

export interface TransferenciaParaEstorno {
  readonly id: string;
  readonly resumo: string;
  readonly valorFormatado: string;
  readonly contaOrigemNome: string;
  readonly contaDestinoNome: string;
}

/** Estorno de transferencia: devolve o dinheiro nas DUAS contas. */
export function BotaoEstornarTransferencia({ transferencia }: { readonly transferencia: TransferenciaParaEstorno }) {
  const [estado, enviar, pendente] = useActionState(acaoEstornarTransferencia, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const [confirmando, setConfirmando] = useState(false);
  const identificador = `estornar-transferencia-${transferencia.id}`;

  return (
    <Dobra rotulo="Estornar" comCaixa={false}>
      <form
        action={enviar}
        {...guardaEnviar}
        id={identificador}
        className={estilos.corpoDobra}
        onSubmit={(evento) => {
          guardaEnviar.onSubmit(evento);
          if (!confirmando) {
            evento.preventDefault();
            setConfirmando(true);
          }
        }}
      >
        <input type="hidden" name="transferenciaId" value={transferencia.id} />

        {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

        <CampoFormulario
          id={`motivo-${transferencia.id}`}
          rotulo="Motivo do estorno"
          dica="Fica registrado no extrato das duas contas e na auditoria."
          obrigatorio
          {...(estado.campos?.motivo?.[0] ? { erro: estado.campos.motivo[0]! } : {})}
        >
          {(a) => <ControleTexto {...a} name="motivo" type="text" placeholder="Transferência feita na conta errada" />}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Estornando...">
            Estornar transferência
          </Botao>
        </p>

        <DialogoConfirmacao
          aberto={confirmando}
          titulo="Confirmar estorno"
          resumo={`Estornar a transferência de ${transferencia.valorFormatado}?`}
          impactos={[
            `Volta para ${transferencia.contaOrigemNome}: ${transferencia.valorFormatado}`,
            `Sai de ${transferencia.contaDestinoNome}: ${transferencia.valorFormatado}`,
            "A transferência original continua no extrato, com o estorno ao lado.",
          ]}
          rotuloConfirmar="Estornar transferência"
          ocupado={pendente}
          aoConfirmar={() => {
            setConfirmando(false);
            (document.getElementById(identificador) as HTMLFormElement | null)?.requestSubmit();
          }}
          aoCancelar={() => setConfirmando(false)}
        />
      </form>
    </Dobra>
  );
}
