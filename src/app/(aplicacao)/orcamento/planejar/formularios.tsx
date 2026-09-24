"use client";

import { useActionState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoPreencherLinha, acaoSalvarPlanejamento, acaoUsarComoBase, type EstadoOrcamento } from "../acoes";
import estilos from "../orcamento.module.css";

const INICIAL: EstadoOrcamento = {};

export interface LinhaParaPlanejar {
  readonly categoriaId: string;
  readonly categoriaNome: string;
  readonly grupoRotulo: string;
  /** Doze valores ja no formato brasileiro, prontos para o campo. */
  readonly valores: readonly string[];
  readonly total: string;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/**
 * Preencher a grade a partir do ano anterior.
 *
 * Partir do REALIZADO e o atalho que mais economiza trabalho: quase ninguem
 * comeca de uma folha em branco, e o que a empresa gastou de verdade no ano
 * passado e a melhor estimativa disponivel do proximo. O reajuste opcional
 * resolve o caso comum de "o mesmo do ano passado, com a inflacao".
 */
export function FormularioBase({ ano }: { readonly ano: number }) {
  const [estado, enviar, pendente] = useActionState(acaoUsarComoBase, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);

  return (
    <form action={enviar} {...guardaEnviar} className={estilos.atalhos}>
      <input type="hidden" name="ano" value={ano} />

      {estado.mensagem ? <Aviso tom="atencao" titulo={estado.mensagem} /> : null}

      <label className={estilos.campo}>
        Preencher com
        <select name="origem" defaultValue="realizado_anterior">
          <option value="realizado_anterior">O realizado de {ano - 1}</option>
          <option value="planejado_anterior">O orçamento de {ano - 1}</option>
        </select>
      </label>

      <label className={estilos.campo}>
        Regime do realizado
        <select name="regime" defaultValue="caixa">
          <option value="caixa">Caixa</option>
          <option value="competencia">Competência</option>
        </select>
      </label>

      <label className={estilos.campo}>
        Reajuste (%)
        <input type="text" name="reajuste" inputMode="decimal" placeholder="8" defaultValue="" />
      </label>

      <Botao type="submit" variante="secundario" ocupado={pendente} rotuloOcupado="Preenchendo...">
        Preencher a grade
      </Botao>
      <p className={estilos.campo}>Isto substitui o que já estiver na grade.</p>
    </form>
  );
}

/**
 * A grade de categoria x mes.
 *
 * Cada linha tem, alem dos doze campos, um atalho para repetir ou distribuir
 * um valor nos doze meses. Sao dois botoes de envio no MESMO formulario
 * (`name="acao"`), sem JavaScript: digitar doze celulas a mao e o que faz a
 * maioria das empresas desistir de orcar no segundo ano.
 */
export function GradeDoOrcamento({ ano, linhas }: { readonly ano: number; readonly linhas: readonly LinhaParaPlanejar[] }) {
  const [estado, enviar, pendente] = useActionState(acaoSalvarPlanejamento, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);

  return (
    <form action={enviar} {...guardaEnviar}>
      <input type="hidden" name="ano" value={ano} />

      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <div className={estilos.rolagem}>
        <table className={estilos.grade}>
          <caption className="apenas-leitor-de-tela">Valores planejados por categoria e mês em {ano}</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              {MESES_CURTOS.map((mes) => (
                <th key={mes} scope="col">{mes}</th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.categoriaId}>
                <th scope="row" className={estilos.nomeCategoria}>
                  {linha.categoriaNome}
                  <span className={estilos.percentual}> · {linha.grupoRotulo}</span>
                </th>
                {linha.valores.map((valor, indice) => (
                  <td key={`${linha.categoriaId}-${indice}`}>
                    <input
                      type="text"
                      inputMode="decimal"
                      name={`celula-${linha.categoriaId}-${indice + 1}`}
                      defaultValue={valor}
                      aria-label={`${linha.categoriaNome}, ${MESES_CURTOS[indice]}`}
                    />
                  </td>
                ))}
                <td className={estilos.numeros}>{linha.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar orçamento de {ano}
        </Botao>
      </p>
    </form>
  );
}

/** Repetir ou distribuir um valor nos doze meses de UMA categoria. */
export function AtalhoDaLinha({
  ano,
  categoriaId,
  categoriaNome,
}: {
  readonly ano: number;
  readonly categoriaId: string;
  readonly categoriaNome: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoPreencherLinha, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);

  return (
    <form action={enviar} {...guardaEnviar} className={estilos.atalhos}>
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="categoriaId" value={categoriaId} />

      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <CampoFormulario id={`base-${categoriaId}`} rotulo={`Valor para ${categoriaNome}`} obrigatorio>
        {(a) => <ControleTexto {...a} name="valorBase" type="text" inputMode="decimal" placeholder="1.000,00" />}
      </CampoFormulario>

      <Botao type="submit" name="acao" value="repetir" variante="secundario" ocupado={pendente} rotuloOcupado="Aplicando...">
        Repetir nos 12 meses
      </Botao>
      <Botao type="submit" name="acao" value="distribuir" variante="secundario" ocupado={pendente} rotuloOcupado="Aplicando...">
        Distribuir no ano
      </Botao>
    </form>
  );
}
