"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import {
  gerarParcelas,
  MAXIMO_PARCELAS,
  MINIMO_PARCELAS,
  NOMES_PERIODICIDADE,
  PERIODICIDADES,
  type ParcelaPlanejada,
  type Periodicidade,
} from "@/compartilhado/financeiro/indice";
import { Aviso, Botao, CampoFormulario, ControleTexto, SecaoFormulario } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoCriarContaReceber, type EstadoFormulario } from "../acoes";
import estilos from "./formulario.module.css";

const INICIAL: EstadoFormulario = {};

export interface OpcaoSelecao {
  readonly id: string;
  readonly nome: string;
}

/** Le um valor digitado sem estourar enquanto a pessoa ainda esta digitando. */
function lerDinheiro(texto: string): Dinheiro | null {
  try {
    const limpo = texto.trim();
    return limpo ? Dinheiro.deTextoBrasileiro(limpo) : null;
  } catch {
    return null;
  }
}

function paraCampo(valor: Dinheiro): string {
  return valor.paraTexto().replace(".", ",");
}

/**
 * Nova conta a receber, a vista ou parcelada.
 *
 * Campos agrupados por assunto (o que e / quando e quanto), rotulo sempre
 * visivel — placeholder nunca faz papel de rotulo — e o valor em campo proprio
 * aceitando o formato brasileiro.
 *
 * A PREVIA DAS PARCELAS e calculada aqui com a MESMA funcao que o servidor usa
 * (`gerarParcelas`, de `compartilhado/financeiro`). Duas implementacoes da
 * regra de arredondamento dariam, mais cedo ou mais tarde, dois resultados
 * diferentes — e o usuario veria uma coisa na tela e outra no banco.
 *
 * A previa e EDITAVEL: cada linha e um par de campos de verdade, enviado no
 * formulario. Sem JavaScript, as linhas nao aparecem e o servidor gera o plano
 * padrao a partir de quantidade, primeiro vencimento e periodicidade — o
 * cadastro continua funcionando, so sem o ajuste fino.
 *
 * A soma e conferida nos dois lugares. Aqui, para avisar na hora; no servidor,
 * porque e la que a conferencia vale.
 */
export function FormularioNovaContaReceber({
  clientes,
  categorias,
  hoje,
}: {
  readonly clientes: readonly OpcaoSelecao[];
  readonly categorias: readonly OpcaoSelecao[];
  readonly hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoCriarContaReceber, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  const [parcelado, setParcelado] = useState(false);
  const [valorTotal, setValorTotal] = useState("");
  const [vencimento, setVencimento] = useState(hoje);
  const [quantidade, setQuantidade] = useState("2");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal");
  /** Ajustes manuais por numero de parcela. Vazio = usar o calculado. */
  const [ajustes, setAjustes] = useState<Record<number, { valor?: string; vencimento?: string }>>({});

  const total = lerDinheiro(valorTotal);
  const vezes = Number(quantidade);

  const calculadas = useMemo((): readonly ParcelaPlanejada[] => {
    if (!parcelado || !total || !total.ehPositivo()) return [];
    if (!Number.isInteger(vezes) || vezes < MINIMO_PARCELAS || vezes > MAXIMO_PARCELAS) return [];
    try {
      return gerarParcelas({
        quantidade: vezes,
        total,
        primeiroVencimento: dataCivilDeTexto(vencimento) as DataVencimento,
        periodicidade,
      });
    } catch {
      return [];
    }
  }, [parcelado, total, vezes, vencimento, periodicidade]);

  const linhas = calculadas.map((parcela) => ({
    numero: parcela.numero,
    vencimento: ajustes[parcela.numero]?.vencimento ?? parcela.dataVencimento,
    valor: ajustes[parcela.numero]?.valor ?? paraCampo(parcela.valor),
  }));

  const somaDasLinhas = linhas.reduce((soma, linha) => {
    const valor = lerDinheiro(linha.valor);
    return valor ? soma.somar(valor) : soma;
  }, Dinheiro.zero());
  const confere = total !== null && linhas.length > 0 && somaDasLinhas.igual(total);

  const ajustar = (numero: number, campo: "valor" | "vencimento", texto: string) =>
    setAjustes((atual) => ({ ...atual, [numero]: { ...atual[numero], [campo]: texto } }));

  return (
    <form action={enviar} {...guardaEnviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o que está indicado e envie de novo.
        </Aviso>
      ) : null}

      <SecaoFormulario titulo="Informações principais" explicacao="O que sera cobrado, e de quem.">
        <CampoFormulario id="descricao" rotulo="Descrição" obrigatorio {...erro("descricao")}>
          {(a) => <ControleTexto {...a} name="descricao" type="text" autoFocus placeholder="Mensalidade de outubro" />}
        </CampoFormulario>

        <CampoFormulario id="clienteId" rotulo="Cliente" obrigatorio {...erro("clienteId")}>
          {(a) => (
            <select {...a} name="clienteId" defaultValue="">
              <option value="" disabled>Escolha um cliente</option>
              {clientes.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario
          id="categoriaId"
          rotulo="Categoria"
          dica="Responde 'de onde vem a receita?' nos relatórios."
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
        <fieldset className={estilos.escolha}>
          <legend>Forma de pagamento da conta</legend>
          <label className={`${estilos.opcao} ${parcelado ? "" : estilos.opcaoMarcada}`}>
            <input type="radio" name="modalidade" value="avista" checked={!parcelado} onChange={() => setParcelado(false)} />
            <span className={estilos.opcaoTexto}>
              <span className={estilos.opcaoTitulo}>À vista</span>
              <span className={estilos.opcaoExplicacao}>Um único vencimento.</span>
            </span>
          </label>
          <label className={`${estilos.opcao} ${parcelado ? estilos.opcaoMarcada : ""}`}>
            <input type="radio" name="modalidade" value="parcelado" checked={parcelado} onChange={() => setParcelado(true)} />
            <span className={estilos.opcaoTexto}>
              <span className={estilos.opcaoTitulo}>Parcelado</span>
              <span className={estilos.opcaoExplicacao}>De {MINIMO_PARCELAS} a {MAXIMO_PARCELAS} vezes.</span>
            </span>
          </label>
        </fieldset>

        <CampoFormulario
          id="dataVencimento"
          rotulo={parcelado ? "Vencimento da 1ª parcela" : "Vencimento"}
          obrigatorio
          {...erro("dataVencimento")}
        >
          {(a) => (
            <ControleTexto
              {...a}
              name="dataVencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          )}
        </CampoFormulario>

        <CampoFormulario
          id="valor"
          rotulo={parcelado ? "Valor total (R$)" : "Valor (R$)"}
          dica="Use vírgula para os centavos."
          obrigatorio
          {...erro("valor")}
        >
          {(a) => (
            <ControleTexto
              {...a}
              name="valor"
              type="text"
              inputMode="decimal"
              placeholder="1.250,00"
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
            />
          )}
        </CampoFormulario>

        {/*
          Sem JavaScript, os campos do parcelamento vivem aqui. O conteudo de
          <noscript> so vira controle de formulario quando nao ha JavaScript;
          com JavaScript ele e texto inerte e nao e enviado. Assim os dois
          caminhos usam os MESMOS nomes de campo sem nunca se duplicarem, e
          parcelar continua possivel com a pagina "crua".
        */}
        <noscript>
          <label>
            Em quantas vezes (apenas se escolher “Parcelado”)
            <input type="number" name="quantidadeParcelas" min={MINIMO_PARCELAS} max={MAXIMO_PARCELAS} defaultValue={2} />
          </label>
          <label>
            A cada quanto tempo
            <select name="periodicidade" defaultValue="mensal">
              {PERIODICIDADES.map((p) => (
                <option key={p} value={p}>{NOMES_PERIODICIDADE[p]}</option>
              ))}
            </select>
          </label>
        </noscript>

        {parcelado ? (
          <>
            <CampoFormulario
              id="quantidadeParcelas"
              rotulo="Em quantas vezes"
              dica={`De ${MINIMO_PARCELAS} a ${MAXIMO_PARCELAS} parcelas.`}
              obrigatorio
              {...erro("quantidadeParcelas")}
            >
              {(a) => (
                <ControleTexto
                  {...a}
                  name="quantidadeParcelas"
                  type="number"
                  min={MINIMO_PARCELAS}
                  max={MAXIMO_PARCELAS}
                  value={quantidade}
                  onChange={(e) => {
                    setQuantidade(e.target.value);
                    // Mudar o numero de vezes refaz o plano do zero: manter os
                    // ajustes antigos misturaria dois planos diferentes.
                    setAjustes({});
                  }}
                />
              )}
            </CampoFormulario>

            <CampoFormulario id="periodicidade" rotulo="A cada quanto tempo" obrigatorio>
              {(a) => (
                <select
                  {...a}
                  name="periodicidade"
                  value={periodicidade}
                  onChange={(e) => {
                    setPeriodicidade(e.target.value as Periodicidade);
                    setAjustes({});
                  }}
                >
                  {PERIODICIDADES.map((p) => (
                    <option key={p} value={p}>{NOMES_PERIODICIDADE[p]}</option>
                  ))}
                </select>
              )}
            </CampoFormulario>
          </>
        ) : null}

        <CampoFormulario id="observacoes" rotulo="Observações">
          {(a) => <ControleTexto {...a} name="observacoes" type="text" />}
        </CampoFormulario>
      </SecaoFormulario>

      {parcelado && linhas.length > 0 ? (
        <SecaoFormulario
          titulo="Confira as parcelas"
          explicacao="Estes são os vencimentos e valores que serão criados. Você pode ajustar qualquer linha — a soma precisa fechar com o total."
        >
          <table className={estilos.previa}>
            <caption>
              A diferença de centavos fica na última parcela. Vencimento em dia que não existe no mês cai no último dia.
            </caption>
            <thead>
              <tr>
                <th scope="col">Parcela</th>
                <th scope="col">Vencimento</th>
                <th scope="col">Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.numero}>
                  <td className={estilos.numero} data-rotulo="Parcela">
                    {linha.numero}/{linhas.length}
                  </td>
                  <td data-rotulo="Vencimento">
                    <input
                      type="date"
                      name="parcelaVencimento"
                      aria-label={`Vencimento da parcela ${linha.numero}`}
                      value={linha.vencimento}
                      onChange={(e) => ajustar(linha.numero, "vencimento", e.target.value)}
                    />
                  </td>
                  <td data-rotulo="Valor">
                    <input
                      type="text"
                      inputMode="decimal"
                      name="parcelaValor"
                      aria-label={`Valor da parcela ${linha.numero}`}
                      value={linha.valor}
                      onChange={(e) => ajustar(linha.numero, "valor", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={estilos.conferencia} aria-live="polite">
            <span>
              Soma das parcelas: <strong>{somaDasLinhas.formatarBrasileiro()}</strong>
            </span>
            <span className={confere ? estilos.confere : estilos.naoConfere}>
              {confere
                ? "Confere com o total."
                : `Precisa somar ${total ? total.formatarBrasileiro() : "o valor total"}.`}
            </span>
          </p>
        </SecaoFormulario>
      ) : null}

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar conta
        </Botao>{" "}
        <Link className="acao-secundaria" href="/contas-receber">Cancelar</Link>
      </p>
    </form>
  );
}
