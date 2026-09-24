"use client";

import { useActionState } from "react";

import { Dobra, Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";

import { NOMES_FORMA_PAGAMENTO, FORMAS_DE_PAGAMENTO } from "../_apoio/formas-de-pagamento";
import {
  acaoAceitarSugestoesExatas,
  acaoConciliar,
  acaoConciliarVarios,
  acaoCriarBaixa,
  acaoCriarLancamento,
  acaoDesconciliar,
  acaoIgnorarItem,
  acaoImportarExtrato,
  type EstadoConciliacao,
} from "./acoes";
import estilos from "./conciliacao.module.css";

const INICIAL: EstadoConciliacao = {};

export interface Opcao {
  readonly id: string;
  readonly nome: string;
}

export interface MovimentacaoParaEscolher {
  readonly id: string;
  readonly rotulo: string;
}

export interface ParcelaParaBaixar {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * Todos os formularios desta tela seguem a mesma regra: sao `<form>` de
 * verdade, com acao de servidor, e o que abre e fecha usa `<details>` nativo.
 * Nada aqui depende de JavaScript para funcionar — e, numa tela em que cada
 * clique decide de que lancamento o dinheiro veio, funcionar importa mais do
 * que ser elegante.
 */

export function FormularioImportacao({ contas, contaEscolhida }: { readonly contas: readonly Opcao[]; readonly contaEscolhida: string }) {
  const [estado, enviar, pendente] = useActionState(acaoImportarExtrato, INICIAL);

  return (
    <form action={enviar}>
      {estado.mensagem ? (
        <Aviso tom={estado.pedeConfirmacaoDeConta ? "atencao" : "perigo"} titulo={estado.mensagem} urgente={!estado.pedeConfirmacaoDeConta}>
          {estado.pedeConfirmacaoDeConta
            ? "Se tiver certeza de que o arquivo é desta conta, marque a confirmação abaixo e envie de novo."
            : "Exporte o extrato no formato OFX (às vezes chamado de “Money” ou “Microsoft Money”) e tente outra vez."}
        </Aviso>
      ) : null}

      <CampoFormulario id="contaBancariaId" rotulo="Conta bancária" obrigatorio>
        {(a) => (
          <select {...a} name="contaBancariaId" defaultValue={contaEscolhida}>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>{conta.nome}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="arquivo" rotulo="Arquivo do extrato (.ofx)" dica="Exporte do aplicativo do banco no formato OFX." obrigatorio>
        {(a) => <input {...a} type="file" name="arquivo" accept=".ofx,application/x-ofx" />}
      </CampoFormulario>

      {estado.pedeConfirmacaoDeConta ? (
        <p>
          <label className={estilos.marcavel}>
            <input type="checkbox" name="confirmar" value="sim" />
            <span>Confirmo que este arquivo é desta conta bancária.</span>
          </label>
        </p>
      ) : null}

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Lendo o arquivo...">
          Importar extrato
        </Botao>
      </p>
    </form>
  );
}

/** Aceita a candidata unica e exata. Um clique, um item. */
export function BotaoConciliar({
  contaBancariaId,
  itemExtratoId,
  movimentacaoId,
  rotulo,
}: {
  readonly contaBancariaId: string;
  readonly itemExtratoId: string;
  readonly movimentacaoId: string;
  readonly rotulo: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoConciliar, INICIAL);

  return (
    <form action={enviar}>
      <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
      <input type="hidden" name="itemExtratoId" value={itemExtratoId} />
      <input type="hidden" name="movimentacaoId" value={movimentacaoId} />
      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}
      <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Conciliando...">
        {rotulo}
      </Botao>
    </form>
  );
}

export function BotaoAceitarExatas({
  contaBancariaId,
  quantidade,
}: {
  readonly contaBancariaId: string;
  readonly quantidade: number;
}) {
  const [estado, enviar, pendente] = useActionState(acaoAceitarSugestoesExatas, INICIAL);

  return (
    <form action={enviar}>
      <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}
      <Botao type="submit" variante="secundario" ocupado={pendente} rotuloOcupado="Conciliando...">
        Aceitar {quantidade} {quantidade === 1 ? "sugestão exata" : "sugestões exatas"}
      </Botao>
    </form>
  );
}

/** Conciliacao 1:N: marca varios lancamentos do sistema para um item do extrato. */
export function FormularioVarios({
  contaBancariaId,
  itemExtratoId,
  valorDoItem,
  movimentacoes,
}: {
  readonly contaBancariaId: string;
  readonly itemExtratoId: string;
  readonly valorDoItem: string;
  readonly movimentacoes: readonly MovimentacaoParaEscolher[];
}) {
  const [estado, enviar, pendente] = useActionState(acaoConciliarVarios, INICIAL);

  return (
    <Dobra rotulo="Conciliar com vários" comCaixa={false}>
      <form action={enviar} className={estilos.corpoDobra}>
        <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
        <input type="hidden" name="itemExtratoId" value={itemExtratoId} />

        {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

        <fieldset>
          <legend>Lançamentos que, somados, dão {valorDoItem}</legend>
          <ul className={estilos.candidatas}>
            {movimentacoes.map((movimentacao) => (
              <li key={movimentacao.id}>
                <label className={estilos.marcavel}>
                  <input type="checkbox" name="movimentacaoId" value={movimentacao.id} />
                  <span>{movimentacao.rotulo}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <p>
          <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Conciliando...">
            Conciliar selecionados
          </Botao>
        </p>
      </form>
    </Dobra>
  );
}

export function FormularioLancamento({
  contaBancariaId,
  itemExtratoId,
  categorias,
}: {
  readonly contaBancariaId: string;
  readonly itemExtratoId: string;
  readonly categorias: readonly Opcao[];
}) {
  const [estado, enviar, pendente] = useActionState(acaoCriarLancamento, INICIAL);

  return (
    <Dobra rotulo="Criar lançamento" comCaixa={false}>
      <form action={enviar} className={estilos.corpoDobra}>
        <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
        <input type="hidden" name="itemExtratoId" value={itemExtratoId} />

        {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

        <CampoFormulario
          id={`categoria-${itemExtratoId}`}
          rotulo="Categoria"
          dica="Obrigatória: sem ela, o valor não aparece em nenhum relatório depois."
          obrigatorio
        >
          {(a) => (
            <select {...a} name="categoriaId" defaultValue="">
              <option value="" disabled>Escolha uma categoria</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Criando...">
            Criar e conciliar
          </Botao>
        </p>
      </form>
    </Dobra>
  );
}

export function FormularioBaixa({
  contaBancariaId,
  itemExtratoId,
  area,
  parcelas,
}: {
  readonly contaBancariaId: string;
  readonly itemExtratoId: string;
  readonly area: "pagar" | "receber";
  readonly parcelas: readonly ParcelaParaBaixar[];
}) {
  const [estado, enviar, pendente] = useActionState(acaoCriarBaixa, INICIAL);
  const rotulo = area === "pagar" ? "Dar baixa numa conta a pagar" : "Dar baixa numa conta a receber";

  return (
    <Dobra rotulo={rotulo} comCaixa={false}>
      <form action={enviar} className={estilos.corpoDobra}>
        <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
        <input type="hidden" name="itemExtratoId" value={itemExtratoId} />
        <input type="hidden" name="area" value={area} />

        {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

        <CampoFormulario id={`parcela-${itemExtratoId}`} rotulo="Conta em aberto" obrigatorio>
          {(a) => (
            <select {...a} name="parcelaId" defaultValue="">
              <option value="" disabled>Escolha a conta</option>
              {parcelas.map((parcela) => (
                <option key={parcela.id} value={parcela.id}>{parcela.rotulo}</option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario id={`forma-${itemExtratoId}`} rotulo="Forma de pagamento" obrigatorio>
          {(a) => (
            <select {...a} name="formaPagamento" defaultValue="pix">
              {FORMAS_DE_PAGAMENTO.map((forma) => (
                <option key={forma} value={forma}>{NOMES_FORMA_PAGAMENTO[forma]}</option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Registrando...">
            Dar baixa e conciliar
          </Botao>
        </p>
      </form>
    </Dobra>
  );
}

export function FormularioIgnorar({
  contaBancariaId,
  itemExtratoId,
}: {
  readonly contaBancariaId: string;
  readonly itemExtratoId: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoIgnorarItem, INICIAL);

  return (
    <Dobra rotulo="Ignorar" comCaixa={false}>
      <form action={enviar} className={estilos.corpoDobra}>
        <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
        <input type="hidden" name="itemExtratoId" value={itemExtratoId} />

        {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

        <CampoFormulario
          id={`ignorar-${itemExtratoId}`}
          rotulo="Motivo"
          dica="Fica gravado no lançamento e na auditoria."
          obrigatorio
          {...(estado.campos?.motivo?.[0] ? { erro: estado.campos.motivo[0]! } : {})}
        >
          {(a) => <ControleTexto {...a} name="motivo" type="text" placeholder="Lançamento duplicado pelo banco" />}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="secundario" ocupado={pendente} rotuloOcupado="Salvando...">
            Ignorar este lançamento
          </Botao>
        </p>
      </form>
    </Dobra>
  );
}

export function FormularioDesconciliar({
  contaBancariaId,
  conciliacaoId,
}: {
  readonly contaBancariaId: string;
  readonly conciliacaoId: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoDesconciliar, INICIAL);

  return (
    <Dobra rotulo="Desconciliar" comCaixa={false}>
      <form action={enviar} className={estilos.corpoDobra}>
        <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
        <input type="hidden" name="conciliacaoId" value={conciliacaoId} />

        {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

        <CampoFormulario
          id={`desfazer-${conciliacaoId}`}
          rotulo="Motivo"
          dica="Desfazer libera os dois lados para uma nova conciliação."
          obrigatorio
          {...(estado.campos?.motivo?.[0] ? { erro: estado.campos.motivo[0]! } : {})}
        >
          {(a) => <ControleTexto {...a} name="motivo" type="text" placeholder="Casei com o lançamento errado" />}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Desfazendo...">
            Desfazer conciliação
          </Botao>
        </p>
      </form>
    </Dobra>
  );
}
