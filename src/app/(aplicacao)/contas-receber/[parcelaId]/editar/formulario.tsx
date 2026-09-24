"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { CamposEditaveis } from "@/compartilhado/financeiro/indice";
import { Aviso, Botao, CampoFormulario, ControleTexto, SecaoFormulario } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoEditarContaReceber, type EstadoFormulario } from "../../acoes";
import estilos from "./formulario.module.css";

const INICIAL: EstadoFormulario = {};

export interface OpcaoSelecao {
  readonly id: string;
  readonly nome: string;
}

export interface ContaParaEdicao {
  readonly parcelaId: string;
  readonly descricao: string;
  readonly clienteId: string;
  readonly clienteNome: string;
  readonly categoriaId: string;
  readonly categoriaNome: string;
  readonly dataVencimento: string;
  readonly valorCanonico: string;
  readonly valorFormatado: string;
  readonly observacoes: string | null;
  readonly numeroParcela: number;
  readonly quantidadeParcelas: number;
}

/**
 * Um campo que o estado da conta nao deixa mais mudar.
 *
 * Mostra o valor atual (a informacao continua visivel) e, logo abaixo, a
 * explicacao de POR QUE nao pode mudar. Um `<input disabled>` sozinho so
 * comunica "nao pode" — e deixa a pessoa adivinhando o motivo, ou pior,
 * achando que e defeito.
 *
 * O valor vai junto num campo escondido para o formulario continuar completo;
 * o servidor o compara com o que esta gravado e recusa se nao bater, entao
 * mexer nele pelo navegador nao adianta nada.
 */
function CampoBloqueado({
  rotulo,
  valor,
  motivo,
  name,
  valorEnviado,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly motivo: string | null;
  readonly name: string;
  readonly valorEnviado: string;
}) {
  return (
    <div className={estilos.bloqueado}>
      <span className={estilos.bloqueadoRotulo}>{rotulo}</span>
      <span className={estilos.bloqueadoValor}>{valor}</span>
      {motivo ? <span className={estilos.bloqueadoMotivo}>{motivo}</span> : null}
      <input type="hidden" name={name} value={valorEnviado} />
    </div>
  );
}

export function FormularioEdicaoContaReceber({
  conta,
  editaveis,
  motivos,
  clientes,
  categorias,
}: {
  readonly conta: ContaParaEdicao;
  readonly editaveis: CamposEditaveis;
  readonly motivos: { readonly pessoa: string | null; readonly vencimento: string | null; readonly valor: string | null };
  readonly clientes: readonly OpcaoSelecao[];
  readonly categorias: readonly OpcaoSelecao[];
}) {
  const [estado, enviar, pendente] = useActionState(acaoEditarContaReceber, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  return (
    <form action={enviar} {...guardaEnviar}>
      <input type="hidden" name="parcelaId" value={conta.parcelaId} />

      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o que está indicado e envie de novo.
        </Aviso>
      ) : null}

      {conta.quantidadeParcelas > 1 ? (
        <Aviso tom="informacao" titulo={`Você está editando a parcela ${conta.numeroParcela} de ${conta.quantidadeParcelas}`}>
          Descrição e categoria valem para a conta inteira. Vencimento e valor são só desta parcela.
        </Aviso>
      ) : null}

      <SecaoFormulario titulo="Informações principais" explicacao="O que será cobrado, e de quem.">
        <CampoFormulario id="descricao" rotulo="Descrição" obrigatorio {...erro("descricao")}>
          {(a) => <ControleTexto {...a} name="descricao" type="text" autoFocus defaultValue={conta.descricao} />}
        </CampoFormulario>

        {editaveis.pessoa ? (
          <CampoFormulario id="clienteId" rotulo="Cliente" obrigatorio {...erro("clienteId")}>
            {(a) => (
              <select {...a} name="clienteId" defaultValue={conta.clienteId}>
                {clientes.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            )}
          </CampoFormulario>
        ) : (
          <CampoBloqueado
            rotulo="Cliente"
            valor={conta.clienteNome}
            motivo={motivos.pessoa}
            name="clienteId"
            valorEnviado={conta.clienteId}
          />
        )}

        <CampoFormulario id="categoriaId" rotulo="Categoria" obrigatorio {...erro("categoriaId")}>
          {(a) => (
            <select {...a} name="categoriaId" defaultValue={conta.categoriaId}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          )}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario titulo="Financeiro" explicacao="Quando vence e quanto é.">
        {editaveis.vencimento ? (
          <CampoFormulario id="dataVencimento" rotulo="Vencimento" obrigatorio {...erro("dataVencimento")}>
            {(a) => <ControleTexto {...a} name="dataVencimento" type="date" defaultValue={conta.dataVencimento} />}
          </CampoFormulario>
        ) : (
          <CampoBloqueado
            rotulo="Vencimento"
            valor={conta.dataVencimento.split("-").reverse().join("/")}
            motivo={motivos.vencimento}
            name="dataVencimento"
            valorEnviado={conta.dataVencimento}
          />
        )}

        {editaveis.valor ? (
          <CampoFormulario id="valor" rotulo="Valor (R$)" dica="Use vírgula para os centavos." obrigatorio {...erro("valor")}>
            {(a) => (
              <ControleTexto
                {...a}
                name="valor"
                type="text"
                inputMode="decimal"
                defaultValue={conta.valorCanonico.replace(".", ",")}
              />
            )}
          </CampoFormulario>
        ) : (
          <CampoBloqueado
            rotulo="Valor"
            valor={conta.valorFormatado}
            motivo={motivos.valor}
            name="valor"
            valorEnviado={conta.valorCanonico.replace(".", ",")}
          />
        )}

        <CampoFormulario id="observacoes" rotulo="Observações">
          {(a) => <ControleTexto {...a} name="observacoes" type="text" defaultValue={conta.observacoes ?? ""} />}
        </CampoFormulario>
      </SecaoFormulario>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar alterações
        </Botao>{" "}
        <Link className="acao-secundaria" href={`/contas-receber/${conta.parcelaId}`}>Cancelar</Link>
      </p>
    </form>
  );
}
