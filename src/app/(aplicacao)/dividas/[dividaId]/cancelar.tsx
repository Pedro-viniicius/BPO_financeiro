"use client";

import { useActionState, useState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao, SecaoFormulario } from "@/interface/componentes/indice";

import { acaoCancelarDivida, type EstadoDivida } from "../acoes";
import estilos from "./detalhe.module.css";

const INICIAL: EstadoDivida = {};

/**
 * Cancelamento da divida.
 *
 * Cancelar NAO quita: as parcelas ainda nao pagas deixam de ser cobradas, e o
 * que ja foi pago continua pago, porque o dinheiro saiu do banco de verdade.
 * Quitacao antecipada, com recalculo de juros, e outra operacao — ainda nao
 * implementada (ver pendencias da entrega).
 *
 * `<details>` em vez de estado de botao: abrir e fechar e nativo do navegador,
 * entao o formulario existe na pagina crua e cancelar nao vira a unica
 * operacao do sistema que exige JavaScript.
 */
export function FormularioCancelarDivida({
  dividaId,
  codigo,
  parcelasPagas,
}: {
  readonly dividaId: string;
  readonly codigo: string;
  readonly parcelasPagas: number;
}) {
  const [estado, enviar, pendente] = useActionState(acaoCancelarDivida, INICIAL);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <SecaoFormulario
      titulo="Cancelar dívida"
      explicacao="As parcelas ainda não pagas deixam de ser cobradas. O que já foi pago continua registrado."
    >
      <details className={estilos.dobra} open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary className={estilos.gatilho}>Cancelar esta dívida</summary>
        <form
          action={enviar}
          id="cancelar-divida"
          onSubmit={(evento) => {
            if (!confirmando) {
              evento.preventDefault();
              setConfirmando(true);
            }
          }}
        >
          <input type="hidden" name="dividaId" value={dividaId} />

          {estado.mensagem ? (
            <Aviso tom="perigo" titulo={estado.mensagem} urgente>
              Corrija e tente de novo.
            </Aviso>
          ) : null}

          <CampoFormulario
            id="motivoCancelamentoDivida"
            rotulo="Motivo do cancelamento"
            dica="Fica registrado na auditoria: quem cancelou, quando e por quê."
            obrigatorio
            {...(estado.campos?.motivo?.[0] ? { erro: estado.campos.motivo[0]! } : {})}
          >
            {(a) => <ControleTexto {...a} name="motivo" type="text" placeholder="Contrato liquidado no banco" />}
          </CampoFormulario>

          <p>
            <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Cancelando...">
              Cancelar dívida
            </Botao>{" "}
            <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
              Deixar como está
            </Botao>
          </p>

          <DialogoConfirmacao
            aberto={confirmando}
            titulo="Confirmar cancelamento"
            resumo={`Cancelar a dívida ${codigo}?`}
            impactos={[
              "As parcelas ainda em aberto serão canceladas também em Contas a pagar.",
              parcelasPagas > 0
                ? `As ${parcelasPagas} ${parcelasPagas === 1 ? "parcela já paga continua paga" : "parcelas já pagas continuam pagas"}: o dinheiro não volta.`
                : "Nenhuma parcela foi paga ainda: nenhum dinheiro se move.",
              "As parcelas canceladas saem do Fluxo de caixa previsto.",
              "A dívida continua consultável, marcada como cancelada.",
            ]}
            rotuloConfirmar="Cancelar dívida"
            ocupado={pendente}
            aoConfirmar={() => {
              setConfirmando(false);
              (document.getElementById("cancelar-divida") as HTMLFormElement | null)?.requestSubmit();
            }}
            aoCancelar={() => setConfirmando(false)}
          />
        </form>
      </details>
    </SecaoFormulario>
  );
}
