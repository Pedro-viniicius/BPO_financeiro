"use client";

import { useActionState, useState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao, Dobra, SecaoFormulario } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoCancelarContaReceber, type EstadoFormulario } from "../acoes";

const INICIAL: EstadoFormulario = {};

export interface ContaParaCancelamento {
  readonly tituloId: string;
  readonly parcelaId: string;
  readonly descricao: string;
  readonly saldoFormatado: string;
  readonly temBaixa: boolean;
  readonly parcelasEmAberto: number;
}

/**
 * Cancelamento da conta — ou do que sobrou dela.
 *
 * Quando ja houve recebimento, a acao NAO se chama "cancelar conta": chama-se
 * "cancelar o saldo restante". O nome importa porque o efeito e outro — o que
 * foi recebido continua recebido, e dizer "cancelar conta" sugeriria que o dinheiro
 * volta. Ele nao volta; para isso existe o estorno.
 */
export function FormularioCancelamento({ conta }: { readonly conta: ContaParaCancelamento }) {
  const [estado, enviar, pendente] = useActionState(acaoCancelarContaReceber, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const rotulo = conta.temBaixa ? "Cancelar o saldo restante" : "Cancelar esta conta";

  return (
    <SecaoFormulario
      titulo={rotulo}
      explicacao={
        conta.temBaixa
          ? "Os recebimentos já registrados continuam valendo. Só o que ainda não foi recebido deixa de ser cobrado."
          : "A conta sai dos totais a receber, mas continua consultável pelo filtro de situação."
      }
    >
      {/*
        `<details>`: abrir e fechar e nativo do navegador, entao o formulario
        existe na pagina crua e cancelar nao vira a unica operacao do sistema
        que exige JavaScript.
      */}
      <Dobra rotulo={rotulo} aberta={aberto} aoAlternar={setAberto} comCaixa={false}>
        <form
          action={enviar}
          {...guardaEnviar}
          id="cancelar-conta"
          onSubmit={(evento) => {
            guardaEnviar.onSubmit(evento);
            if (!confirmando) {
              evento.preventDefault();
              setConfirmando(true);
            }
          }}
        >
          <input type="hidden" name="tituloId" value={conta.tituloId} />
          <input type="hidden" name="parcelaId" value={conta.parcelaId} />

          {estado.mensagem ? (
            <Aviso tom="perigo" titulo={estado.mensagem} urgente>
              Corrija e tente de novo.
            </Aviso>
          ) : null}

          <CampoFormulario
            id="motivoCancelamento"
            rotulo="Motivo do cancelamento"
            dica="Fica registrado na conta e na auditoria."
            obrigatorio
            {...(estado.campos?.motivo?.[0] ? { erro: estado.campos.motivo[0]! } : {})}
          >
            {(a) => (
              <ControleTexto
                {...a}
                name="motivo"
                type="text"
                autoFocus
                placeholder="Cliente desistiu do serviço"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            )}
          </CampoFormulario>

          <p>
            <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Cancelando...">
              {rotulo}
            </Botao>{" "}
            <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
              Deixar como está
            </Botao>
          </p>

          <DialogoConfirmacao
            aberto={confirmando}
            titulo="Confirmar cancelamento"
            resumo={`${rotulo} de “${conta.descricao}”?`}
            impactos={[
              `Deixa de ser cobrado: ${conta.saldoFormatado}`,
              conta.parcelasEmAberto > 1
                ? `${conta.parcelasEmAberto} parcelas em aberto serão canceladas.`
                : "A parcela em aberto será cancelada.",
              conta.temBaixa
                ? "Os recebimentos já registrados continuam valendo e não saem da conta bancária."
                : "Nenhum dinheiro se move: esta conta nunca teve recebimento.",
              "A conta continua consultável pelo filtro de situação “Cancelada”.",
            ]}
            rotuloConfirmar={rotulo}
            ocupado={pendente}
            aoConfirmar={() => {
              setConfirmando(false);
              (document.getElementById("cancelar-conta") as HTMLFormElement | null)?.requestSubmit();
            }}
            aoCancelar={() => setConfirmando(false)}
          />
        </form>
      </Dobra>
    </SecaoFormulario>
  );
}
