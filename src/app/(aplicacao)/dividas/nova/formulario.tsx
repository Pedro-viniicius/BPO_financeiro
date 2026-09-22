"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { dataCivilDeTexto, type DataVencimento } from "@/compartilhado/datas/indice";
import { Dinheiro } from "@/compartilhado/dinheiro/indice";
import {
  EXPLICACAO_SISTEMA,
  gerarCronograma,
  MAXIMO_PARCELAS_DIVIDA,
  MINIMO_PARCELAS_DIVIDA,
  NOMES_SISTEMA,
  SISTEMAS,
  taxaAnualParaMensal,
  type ParcelaDoCronograma,
  type SistemaAmortizacao,
} from "@/compartilhado/financeiro/indice";
import { Aviso, Botao, CampoFormulario, ControleTexto, SecaoFormulario } from "@/interface/componentes/indice";

import { acaoCriarDivida, type EstadoDivida } from "../acoes";
import estilos from "./formulario.module.css";

const INICIAL: EstadoDivida = {};

const TIPOS = [
  { valor: "emprestimo", nome: "Empréstimo" },
  { valor: "financiamento", nome: "Financiamento" },
  { valor: "cartao_credito", nome: "Cartão de crédito" },
  { valor: "cheque_especial", nome: "Cheque especial" },
  { valor: "outro", nome: "Outro" },
] as const;

export interface OpcaoSelecao {
  readonly id: string;
  readonly nome: string;
}

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

function lerTaxa(texto: string): number | null {
  const numero = Number(texto.replace("%", "").replace(",", ".").trim());
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/**
 * Registro de uma divida com cronograma.
 *
 * A PREVIA e calculada aqui com a MESMA funcao do servidor (`gerarCronograma`,
 * do dominio do modulo). Duas implementacoes de Price dariam, mais cedo ou mais
 * tarde, dois resultados diferentes — e a pessoa veria uma parcela na tela e
 * outra na conta a pagar.
 *
 * A previa e EDITAVEL porque o contrato do banco manda: quando a instituicao
 * cobra IOF, tarifa ou arredonda a seu modo, o cronograma real nao bate com o
 * Price teorico ao centavo. Editar as linhas e o caminho para registrar a
 * divida como ela e — inclusive a mao, sem Price nem SAC.
 *
 * A soma das AMORTIZACOES precisa fechar com o valor contratado; os juros sao
 * livres. Amortizar mais do que se pegou emprestado, ou menos, deixaria o
 * saldo devedor sem sentido para sempre. A conferencia aparece aqui, na hora,
 * e roda de novo no servidor, que e onde ela vale.
 *
 * Sem JavaScript as linhas nao existem e o servidor gera o cronograma padrao a
 * partir de valor, taxa, prazo e sistema: registrar continua possivel.
 */
export function FormularioNovaDivida({
  credores,
  categorias,
  contas,
  hoje,
}: {
  readonly credores: readonly OpcaoSelecao[];
  readonly categorias: readonly OpcaoSelecao[];
  readonly contas: readonly OpcaoSelecao[];
  readonly hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoCriarDivida, INICIAL);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  const [valorPrincipal, setValorPrincipal] = useState("");
  const [taxa, setTaxa] = useState("");
  const [baseDaTaxa, setBaseDaTaxa] = useState<"mensal" | "anual">("mensal");
  const [sistema, setSistema] = useState<SistemaAmortizacao>("price");
  const [quantidade, setQuantidade] = useState("12");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje);
  /** Ajustes por numero de parcela. Vazio = usar o calculado. */
  const [ajustes, setAjustes] = useState<Record<number, { vencimento?: string; amortizacao?: string; juros?: string }>>({});

  const principal = lerDinheiro(valorPrincipal);
  const taxaInformada = lerTaxa(taxa);
  const taxaMensal =
    taxaInformada === null ? null : baseDaTaxa === "anual" ? taxaAnualParaMensal(taxaInformada) : taxaInformada;
  const vezes = Number(quantidade);

  const calculado = useMemo((): readonly ParcelaDoCronograma[] => {
    if (!principal || !principal.ehPositivo() || taxaMensal === null) return [];
    if (!Number.isInteger(vezes) || vezes < MINIMO_PARCELAS_DIVIDA || vezes > MAXIMO_PARCELAS_DIVIDA) return [];
    if (sistema !== "price" && sistema !== "sac") return [];
    try {
      return gerarCronograma({
        valorPrincipal: principal,
        taxaMensal,
        quantidadeParcelas: vezes,
        primeiroVencimento: dataCivilDeTexto(primeiroVencimento) as DataVencimento,
        sistema,
      });
    } catch {
      return [];
    }
  }, [principal, taxaMensal, vezes, primeiroVencimento, sistema]);

  const linhas = calculado.map((parcela) => ({
    numero: parcela.numero,
    vencimento: ajustes[parcela.numero]?.vencimento ?? parcela.dataVencimento,
    amortizacao: ajustes[parcela.numero]?.amortizacao ?? paraCampo(parcela.valorAmortizacao),
    juros: ajustes[parcela.numero]?.juros ?? paraCampo(parcela.valorJuros),
  }));

  const somar = (pegar: (linha: (typeof linhas)[number]) => string) =>
    linhas.reduce((soma, linha) => {
      const valor = lerDinheiro(pegar(linha));
      return valor ? soma.somar(valor) : soma;
    }, Dinheiro.zero());

  const somaAmortizacao = somar((linha) => linha.amortizacao);
  const somaJuros = somar((linha) => linha.juros);
  const confere = principal !== null && linhas.length > 0 && somaAmortizacao.igual(principal);
  const custoTotal = somaAmortizacao.somar(somaJuros);

  const ajustar = (numero: number, campo: "vencimento" | "amortizacao" | "juros", texto: string) =>
    setAjustes((atual) => ({ ...atual, [numero]: { ...atual[numero], [campo]: texto } }));

  const refazer = () => setAjustes({});

  return (
    <form action={enviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o que está indicado e envie de novo.
        </Aviso>
      ) : null}

      <SecaoFormulario titulo="O que é esta dívida" explicacao="Com quem foi contratada e sob qual contrato.">
        <CampoFormulario id="credorPessoaId" rotulo="Credor" obrigatorio {...erro("credorPessoaId")}>
          {(a) => (
            <select {...a} name="credorPessoaId" defaultValue="">
              <option value="" disabled>Escolha o credor</option>
              {credores.map((credor) => <option key={credor.id} value={credor.id}>{credor.nome}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario id="tipo" rotulo="Tipo" obrigatorio {...erro("tipo")}>
          {(a) => (
            <select {...a} name="tipo" defaultValue="emprestimo">
              {TIPOS.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{tipo.nome}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario id="descricao" rotulo="Descrição" obrigatorio {...erro("descricao")}>
          {(a) => <ControleTexto {...a} name="descricao" type="text" placeholder="Capital de giro — Banco do Brasil" />}
        </CampoFormulario>

        <CampoFormulario id="numeroContrato" rotulo="Número do contrato" {...erro("numeroContrato")}>
          {(a) => <ControleTexto {...a} name="numeroContrato" type="text" />}
        </CampoFormulario>

        <CampoFormulario id="dataContratacao" rotulo="Data da contratação" obrigatorio {...erro("dataContratacao")}>
          {(a) => <ControleTexto {...a} name="dataContratacao" type="date" defaultValue={hoje} />}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario
        titulo="Quanto, a que custo e em quantas vezes"
        explicacao="Com estes dados a prévia do cronograma é montada abaixo."
      >
        <CampoFormulario
          id="valorPrincipal"
          rotulo="Valor contratado (R$)"
          dica="O que entrou, sem os juros."
          obrigatorio
          {...erro("valorPrincipal")}
        >
          {(a) => (
            <ControleTexto
              {...a}
              name="valorPrincipal"
              type="text"
              inputMode="decimal"
              placeholder="12.000,00"
              value={valorPrincipal}
              onChange={(e) => { setValorPrincipal(e.target.value); refazer(); }}
            />
          )}
        </CampoFormulario>

        <CampoFormulario id="taxa" rotulo="Taxa de juros (%)" obrigatorio {...erro("taxa")}>
          {(a) => (
            <ControleTexto
              {...a}
              name="taxa"
              type="text"
              inputMode="decimal"
              placeholder="2,00"
              value={taxa}
              onChange={(e) => { setTaxa(e.target.value); refazer(); }}
            />
          )}
        </CampoFormulario>

        <CampoFormulario
          id="baseDaTaxa"
          rotulo="A taxa informada é"
          dica={
            taxaInformada !== null && baseDaTaxa === "anual" && taxaMensal !== null
              ? `Equivale a ${taxaMensal.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% ao mês.`
              : "Guardamos sempre ao mês, para poder comparar."
          }
        >
          {(a) => (
            <select
              {...a}
              name="baseDaTaxa"
              value={baseDaTaxa}
              onChange={(e) => { setBaseDaTaxa(e.target.value as "mensal" | "anual"); refazer(); }}
            >
              <option value="mensal">ao mês</option>
              <option value="anual">ao ano</option>
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario
          id="sistema"
          rotulo="Sistema de amortização"
          dica={EXPLICACAO_SISTEMA[sistema]}
          obrigatorio
          {...erro("sistema")}
        >
          {(a) => (
            <select
              {...a}
              name="sistema"
              value={sistema}
              onChange={(e) => { setSistema(e.target.value as SistemaAmortizacao); refazer(); }}
            >
              {SISTEMAS.map((s) => <option key={s} value={s}>{NOMES_SISTEMA[s]}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario
          id="quantidadeParcelas"
          rotulo="Em quantas parcelas"
          dica={`De ${MINIMO_PARCELAS_DIVIDA} a ${MAXIMO_PARCELAS_DIVIDA}.`}
          obrigatorio
          {...erro("quantidadeParcelas")}
        >
          {(a) => (
            <ControleTexto
              {...a}
              name="quantidadeParcelas"
              type="number"
              min={MINIMO_PARCELAS_DIVIDA}
              max={MAXIMO_PARCELAS_DIVIDA}
              value={quantidade}
              onChange={(e) => { setQuantidade(e.target.value); refazer(); }}
            />
          )}
        </CampoFormulario>

        <CampoFormulario id="primeiroVencimento" rotulo="Primeiro vencimento" obrigatorio {...erro("primeiroVencimento")}>
          {(a) => (
            <ControleTexto
              {...a}
              name="primeiroVencimento"
              type="date"
              value={primeiroVencimento}
              onChange={(e) => { setPrimeiroVencimento(e.target.value); refazer(); }}
            />
          )}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario
        titulo="Como isso aparece no financeiro"
        explicacao="Os juros são despesa financeira; a amortização não é despesa — é a dívida diminuindo."
      >
        <CampoFormulario
          id="categoriaJurosId"
          rotulo="Categoria dos juros"
          dica="Só categorias do grupo “Resultado financeiro” aparecem aqui."
          obrigatorio
          {...erro("categoriaJurosId")}
        >
          {(a) => (
            <select {...a} name="categoriaJurosId" defaultValue={categorias.length === 1 ? categorias[0]!.id : ""}>
              <option value="" disabled>Escolha a categoria</option>
              {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario
          id="contaBancariaCreditoId"
          rotulo="Conta onde o dinheiro entrou"
          dica="Opcional. Registra a entrada do empréstimo no banco — que não é receita, é dívida."
          {...erro("contaBancariaCreditoId")}
        >
          {(a) => (
            <select {...a} name="contaBancariaCreditoId" defaultValue="">
              <option value="">Não registrar a entrada agora</option>
              {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario id="observacoes" rotulo="Observações" {...erro("observacoes")}>
          {(a) => <ControleTexto {...a} name="observacoes" type="text" />}
        </CampoFormulario>
      </SecaoFormulario>

      {linhas.length > 0 ? (
        <SecaoFormulario
          titulo="Confira o cronograma"
          explicacao="Estas parcelas serão criadas em Contas a pagar, uma a uma. Ajuste qualquer linha para bater com o contrato do banco."
        >
          <p className={estilos.resumo}>
            <span>Parcela {sistema === "price" ? "fixa" : "decrescente"}: <strong>{linhas.length}x</strong></span>
            <span>Total de juros: <strong>{somaJuros.formatarBrasileiro()}</strong></span>
            <span>Custo total: <strong>{custoTotal.formatarBrasileiro()}</strong></span>
          </p>

          <div className={estilos.rolagem}>
            <table className={estilos.previa}>
              <caption>
                A diferença de centavos fica na última parcela, para que a soma feche exatamente com o valor contratado.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Parcela</th>
                  <th scope="col">Vencimento</th>
                  <th scope="col">Amortização (R$)</th>
                  <th scope="col">Juros (R$)</th>
                  <th scope="col" className={estilos.numerico}>Parcela (R$)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => {
                  const amortizacao = lerDinheiro(linha.amortizacao);
                  const juros = lerDinheiro(linha.juros);
                  const total = (amortizacao ?? Dinheiro.zero()).somar(juros ?? Dinheiro.zero());
                  return (
                    <tr key={linha.numero}>
                      <td className={estilos.numero} data-rotulo="Parcela">{linha.numero}/{linhas.length}</td>
                      <td data-rotulo="Vencimento">
                        <input
                          type="date"
                          name="parcelaVencimento"
                          aria-label={`Vencimento da parcela ${linha.numero}`}
                          value={linha.vencimento}
                          onChange={(e) => ajustar(linha.numero, "vencimento", e.target.value)}
                        />
                      </td>
                      <td data-rotulo="Amortização">
                        <input
                          type="text"
                          inputMode="decimal"
                          name="parcelaAmortizacao"
                          aria-label={`Amortização da parcela ${linha.numero}`}
                          value={linha.amortizacao}
                          onChange={(e) => ajustar(linha.numero, "amortizacao", e.target.value)}
                        />
                      </td>
                      <td data-rotulo="Juros">
                        <input
                          type="text"
                          inputMode="decimal"
                          name="parcelaJuros"
                          aria-label={`Juros da parcela ${linha.numero}`}
                          value={linha.juros}
                          onChange={(e) => ajustar(linha.numero, "juros", e.target.value)}
                        />
                      </td>
                      <td data-rotulo="Parcela" className={estilos.numerico}>{total.formatarBrasileiro()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className={estilos.conferencia} aria-live="polite">
            <span>
              Soma das amortizações: <strong>{somaAmortizacao.formatarBrasileiro()}</strong>
            </span>
            <span className={confere ? estilos.confere : estilos.naoConfere}>
              {confere
                ? "Confere com o valor contratado."
                : `Precisa somar ${principal ? principal.formatarBrasileiro() : "o valor contratado"}.`}
            </span>
          </p>

          {Object.keys(ajustes).length > 0 ? (
            <p>
              <Botao type="button" variante="secundario" onClick={refazer}>
                Voltar ao cronograma calculado
              </Botao>
            </p>
          ) : null}
        </SecaoFormulario>
      ) : null}

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Registrando...">
          Registrar dívida
        </Botao>{" "}
        <Link className="acao-secundaria" href="/dividas">Cancelar</Link>
      </p>
    </form>
  );
}
