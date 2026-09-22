"use client";

import { useActionState, useState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao } from "@/interface/componentes/indice";

import { acaoEstornarRecebimento, type EstadoFormulario } from "../acoes";
import estilos from "./acoes-de-correcao.module.css";

const INICIAL: EstadoFormulario = {};

export interface RecebimentoParaEstorno {
  readonly recebimentoId: string;
  readonly parcelaId: string;
  readonly valorFormatado: string;
  readonly contaBancariaNome: string;
  readonly dataFormatada: string;
  readonly abatidoFormatado: string;
}

/**
 * Estorno de um recebimento.
 *
 * O motivo e OBRIGATORIO e vem antes da confirmacao, nao depois: quem digita
 * a razao ja parou para pensar. Sem motivo, meses depois ninguem sabe se a
 * linha estornada foi erro de digitacao, cheque devolvido ou acerto com o
 * cliente — e essa diferenca muda o que se faz a seguir.
 *
 * A confirmacao repete em palavras o que vai acontecer: quanto volta, para
 * qual conta, e que a baixa original continua visivel.
 */
export function BotaoEstornar({ recebimento }: { readonly recebimento: RecebimentoParaEstorno }) {
  const [estado, enviar, pendente] = useActionState(acaoEstornarRecebimento, INICIAL);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const identificador = `estornar-${recebimento.recebimentoId}`;

  /*
   * `<details>` em vez de um botao que troca estado.
   *
   * Abrir e fechar e comportamento nativo do navegador: funciona sem
   * JavaScript, ja vem com o papel de divulgacao para leitores de tela e
   * responde ao teclado sozinho. Com um `<button onClick>`, o formulario de
   * estorno simplesmente nao existiria na pagina crua — e estornar viraria a
   * unica operacao do sistema que exige JavaScript.
   */
  return (
    <details className={estilos.dobra} open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className={estilos.gatilho}>Estornar</summary>
      <form
      action={enviar}
      id={identificador}
      onSubmit={(evento) => {
        if (!confirmando) {
          evento.preventDefault();
          setConfirmando(true);
        }
      }}
    >
      <input type="hidden" name="recebimentoId" value={recebimento.recebimentoId} />
      <input type="hidden" name="parcelaId" value={recebimento.parcelaId} />

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario
        id={`motivo-${recebimento.recebimentoId}`}
        rotulo="Motivo do estorno"
        dica="Fica registrado no histórico e na auditoria."
        obrigatorio
        {...(estado.campos?.motivo?.[0] ? { erro: estado.campos.motivo[0]! } : {})}
      >
        {(a) => (
          <ControleTexto
            {...a}
            name="motivo"
            type="text"
            autoFocus
            placeholder="Recebimento lançado em duplicidade"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </CampoFormulario>

      <p>
        <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Estornando...">
          Estornar recebimento
        </Botao>{" "}
        <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
          Deixar como está
        </Botao>
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Confirmar estorno"
        resumo={`Estornar o recebimento de ${recebimento.valorFormatado} feito em ${recebimento.dataFormatada}?`}
        impactos={[
          `Sai de volta de: ${recebimento.contaBancariaNome} · ${recebimento.valorFormatado}`,
          `Volta ao saldo da conta: ${recebimento.abatidoFormatado}`,
          "O recebimento original continua no histórico, marcado como estornado.",
          "O extrato da conta bancária mostra a entrada e a saída.",
        ]}
        rotuloConfirmar="Estornar recebimento"
        ocupado={pendente}
        aoConfirmar={() => {
          setConfirmando(false);
          (document.getElementById(identificador) as HTMLFormElement | null)?.requestSubmit();
        }}
        aoCancelar={() => setConfirmando(false)}
      />
      </form>
    </details>
  );
}
