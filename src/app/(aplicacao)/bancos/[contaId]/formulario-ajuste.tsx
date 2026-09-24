"use client";

import { useActionState, useState } from "react";

import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import { Aviso, Botao, CampoFormulario, ControleTexto, DialogoConfirmacao } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoAjustarSaldo, type EstadoFormulario } from "../acoes";
import estilos from "./formulario-ajuste.module.css";

const INICIAL: EstadoFormulario = {};

export interface ContaParaAjuste {
  readonly contaId: string;
  readonly nome: string;
  readonly saldoFormatado: string;
  readonly saldoCanonico: string;
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
 * Lancamento de ajuste de saldo.
 *
 * A tela mostra o saldo que ficara DEPOIS do ajuste enquanto a pessoa digita.
 * Ajuste e quase sempre feito olhando o extrato do banco: o numero-alvo ja
 * esta na cabeca de quem preenche, e ver o resultado antes de salvar evita o
 * erro classico de lancar a diferenca no sentido contrario.
 */
export function FormularioAjusteDeSaldo({ conta }: { readonly conta: ContaParaAjuste }) {
  const [estado, enviar, pendente] = useActionState(acaoAjustarSaldo, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const [confirmando, setConfirmando] = useState(false);
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(conta.hoje);
  const [motivo, setMotivo] = useState("");

  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const saldoAtual = lerDinheiro(conta.saldoCanonico.replace(".", ","));
  const ajuste = lerDinheiro(valor);
  const saldoDepois = tipo === "entrada" ? saldoAtual.somar(ajuste) : saldoAtual.subtrair(ajuste);

  return (
    <form
      action={enviar}
      {...guardaEnviar}
      id="ajustar-saldo"
      onSubmit={(evento) => {
        guardaEnviar.onSubmit(evento);
        if (!confirmando) {
          evento.preventDefault();
          setConfirmando(true);
        }
      }}
    >
      <input type="hidden" name="contaId" value={conta.contaId} />

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija e tente de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="tipoAjuste" rotulo="O saldo precisa" obrigatorio>
        {(a) => (
          <select {...a} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "saida")}>
            <option value="entrada">Aumentar (faltava dinheiro no sistema)</option>
            <option value="saida">Diminuir (sobrava dinheiro no sistema)</option>
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario
        id="valorAjuste"
        rotulo="Valor do ajuste (R$)"
        dica="A diferença entre o saldo do banco e o do sistema."
        obrigatorio
        {...erro("valor")}
      >
        {(a) => <ControleTexto {...a} name="valor" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario id="dataAjuste" rotulo="Data do ajuste" obrigatorio {...erro("data")}>
        {(a) => <ControleTexto {...a} name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />}
      </CampoFormulario>

      <CampoFormulario
        id="motivoAjuste"
        rotulo="Motivo do ajuste"
        dica="Fica no extrato, ao lado do lançamento, e na auditoria."
        obrigatorio
        {...erro("motivo")}
      >
        {(a) => (
          <ControleTexto
            {...a}
            name="motivo"
            type="text"
            placeholder="Tarifa de manutenção não lançada"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </CampoFormulario>

      <dl className={estilos.contas} aria-live="polite">
        <div>
          <dt>Saldo hoje</dt>
          <dd className={estilos.numero}>{conta.saldoFormatado}</dd>
        </div>
        <div>
          <dt>Saldo depois do ajuste</dt>
          <dd className={estilos.numero}>{saldoDepois.formatarBrasileiro()}</dd>
        </div>
      </dl>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Registrando...">
          Registrar ajuste
        </Botao>
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Confirmar ajuste de saldo"
        resumo={`Registrar um ajuste de ${ajuste.formatarBrasileiro()} em “${conta.nome}”?`}
        impactos={[
          `Saldo hoje: ${conta.saldoFormatado}`,
          `Saldo depois: ${saldoDepois.formatarBrasileiro()}`,
          `Aparece no extrato como “Ajuste de saldo”, em ${data.split("-").reverse().join("/")}.`,
          "Não entra como receita nem como despesa nos relatórios de resultado.",
          "O motivo fica registrado e não pode ser apagado.",
        ]}
        rotuloConfirmar="Registrar ajuste"
        ocupado={pendente}
        aoConfirmar={() => {
          setConfirmando(false);
          (document.getElementById("ajustar-saldo") as HTMLFormElement | null)?.requestSubmit();
        }}
        aoCancelar={() => setConfirmando(false)}
      />
    </form>
  );
}
