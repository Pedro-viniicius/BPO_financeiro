"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto, SecaoFormulario } from "@/interface/componentes/indice";

import { acaoCriarContaReceber, type EstadoFormulario } from "../acoes";

const INICIAL: EstadoFormulario = {};

export interface OpcaoSelecao {
  readonly id: string;
  readonly nome: string;
}

/**
 * Nova conta a pagar.
 *
 * Campos agrupados por assunto (o que e / quando e quanto), rotulo sempre
 * visivel — placeholder nunca faz papel de rotulo — e o valor em campo proprio
 * aceitando o formato brasileiro.
 */
export function FormularioNovaContaReceber({
  clientees,
  categorias,
  hoje,
}: {
  readonly clientees: readonly OpcaoSelecao[];
  readonly categorias: readonly OpcaoSelecao[];
  readonly hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoCriarContaReceber, INICIAL);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  return (
    <form action={enviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o que está indicado e envie de novo.
        </Aviso>
      ) : null}

      <SecaoFormulario titulo="Informações principais" explicacao="O compromisso e de quem ele vem.">
        <CampoFormulario id="descricao" rotulo="Descrição" obrigatorio {...erro("descricao")}>
          {(a) => <ControleTexto {...a} name="descricao" type="text" autoFocus placeholder="Aluguel de outubro" />}
        </CampoFormulario>

        <CampoFormulario id="clienteId" rotulo="Cliente" obrigatorio {...erro("clienteId")}>
          {(a) => (
            <select {...a} name="clienteId" defaultValue="">
              <option value="" disabled>Escolha um cliente</option>
              {clientees.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario
          id="categoriaId"
          rotulo="Categoria"
          dica="Responde 'com o que estamos gastando?' nos relatórios."
          obrigatorio
          {...erro("categoriaId")}
        >
          {(a) => (
            <select {...a} name="categoriaId" defaultValue="">
              <option value="" disabled>Escolha uma categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          )}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario titulo="Financeiro" explicacao="Quando vence e quanto é.">
        <CampoFormulario id="dataVencimento" rotulo="Vencimento" obrigatorio {...erro("dataVencimento")}>
          {(a) => <ControleTexto {...a} name="dataVencimento" type="date" defaultValue={hoje} />}
        </CampoFormulario>

        <CampoFormulario id="valor" rotulo="Valor (R$)" dica="Use vírgula para os centavos." obrigatorio {...erro("valor")}>
          {(a) => <ControleTexto {...a} name="valor" type="text" inputMode="decimal" placeholder="1.250,00" />}
        </CampoFormulario>

        <CampoFormulario id="observacoes" rotulo="Observações">
          {(a) => <ControleTexto {...a} name="observacoes" type="text" />}
        </CampoFormulario>
      </SecaoFormulario>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar conta
        </Botao>{" "}
        <Link className="acao-secundaria" href="/contas-receber">Cancelar</Link>
      </p>
    </form>
  );
}
