"use client";

import { useActionState, useState } from "react";

import { Dobra, Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import {
  acaoAlterarSituacaoCategoria,
  acaoAlterarSituacaoConta,
  acaoExcluirCategoria,
  acaoExcluirConta,
  acaoSalvarCategoria,
  acaoSalvarConta,
  acaoUsarPlanoPadrao,
  type EstadoPlano,
} from "./acoes";
import estilos from "./plano.module.css";

const INICIAL: EstadoPlano = {};

export interface OpcaoConta {
  readonly id: string;
  readonly nome: string;
}

const GRUPOS = [
  { valor: "receita_bruta", nome: "Receitas", onde: "linha “Receita bruta”" },
  { valor: "deducao", nome: "Deduções", onde: "sai da receita bruta" },
  { valor: "custo", nome: "Custos", onde: "linha “Custos”" },
  { valor: "despesa_operacional", nome: "Despesas operacionais", onde: "linha “Despesas operacionais”" },
  { valor: "resultado_financeiro", nome: "Resultado financeiro", onde: "receita ou despesa financeira, conforme o sentido" },
  { valor: "nao_operacional", nome: "Não operacional", onde: "linha “Não operacional”" },
  { valor: "transferencia", nome: "Fora do resultado", onde: "não aparece no Resultados" },
] as const;

function Resposta({ estado }: { estado: EstadoPlano }) {
  if (estado.mensagem) {
    return <Aviso tom="perigo" titulo={estado.mensagem} urgente>Corrija e tente de novo.</Aviso>;
  }
  if (estado.sucesso) {
    return <p className={estilos.sucesso} role="status">{estado.sucesso}</p>;
  }
  return null;
}

export function FormularioConta({
  contas: _contas,
  conta,
}: {
  readonly contas: readonly OpcaoConta[];
  readonly conta?: {
    readonly id: string;
    readonly codigo: string;
    readonly nome: string;
    readonly grupoDre: string;
    readonly ativa: boolean;
    readonly podeExcluir: boolean;
  };
}) {
  const [estado, enviar, pendente] = useActionState(acaoSalvarConta, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const editando = Boolean(conta);

  return (
    <Dobra rotulo={editando ? "Editar conta" : "Nova conta"} destaque={!editando}>
      <Resposta estado={estado} />
      <form action={enviar} {...guardaEnviar} className={estilos.formulario}>
        {conta ? <input type="hidden" name="contaId" value={conta.id} /> : null}

        <CampoFormulario
          id={`codigo-${conta?.id ?? "nova"}`}
          rotulo="Código"
          dica="Números separados por ponto, como 4.1.01."
          obrigatorio
          {...erro("codigo")}
        >
          {(a) => <ControleTexto {...a} name="codigo" type="text" defaultValue={conta?.codigo ?? ""} placeholder="4.1.01" />}
        </CampoFormulario>

        <CampoFormulario id={`nome-conta-${conta?.id ?? "nova"}`} rotulo="Nome" obrigatorio {...erro("nome")}>
          {(a) => <ControleTexto {...a} name="nome" type="text" defaultValue={conta?.nome ?? ""} placeholder="Ocupação" />}
        </CampoFormulario>

        <CampoFormulario
          id={`grupo-${conta?.id ?? "nova"}`}
          rotulo="Onde aparece no resultado"
          {...(editando ? { dica: "Mudar isto reclassifica todo o histórico desta conta no demonstrativo." } : {})}
          obrigatorio
          {...erro("grupoDre")}
        >
          {(a) => (
            <select {...a} name="grupoDre" defaultValue={conta?.grupoDre ?? "despesa_operacional"}>
              {GRUPOS.map((grupo) => (
                <option key={grupo.valor} value={grupo.valor}>
                  {grupo.nome} — {grupo.onde}
                </option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
            {editando ? "Salvar conta" : "Criar conta"}
          </Botao>
        </p>
      </form>

      {conta ? <AcoesDaConta conta={conta} /> : null}
    </Dobra>
  );
}

function AcoesDaConta({
  conta,
}: {
  readonly conta: { readonly id: string; readonly nome: string; readonly ativa: boolean; readonly podeExcluir: boolean };
}) {
  const [estadoSituacao, alterarSituacao, alterando] = useActionState(acaoAlterarSituacaoConta, INICIAL);
  const guardaAlterarSituacao = useGuardaDoFormulario(estadoSituacao);
  const [estadoExclusao, excluir, excluindo] = useActionState(acaoExcluirConta, INICIAL);
  const guardaExcluir = useGuardaDoFormulario(estadoExclusao);

  return (
    <div className={estilos.secundarias}>
      <Resposta estado={estadoSituacao} />
      <Resposta estado={estadoExclusao} />

      <form action={alterarSituacao} {...guardaAlterarSituacao}>
        <input type="hidden" name="id" value={conta.id} />
        <input type="hidden" name="ativa" value={conta.ativa ? "nao" : "sim"} />
        <Botao type="submit" variante="secundario" ocupado={alterando} rotuloOcupado="Alterando...">
          {conta.ativa ? "Inativar conta" : "Reativar conta"}
        </Botao>
        <span className={estilos.explicacao}>
          {conta.ativa
            ? "Some dos formulários novos, junto com as categorias dela. O histórico continua."
            : "Volta a aparecer nos formulários."}
        </span>
      </form>

      {conta.podeExcluir ? (
        <form action={excluir} {...guardaExcluir}>
          <input type="hidden" name="id" value={conta.id} />
          <Botao type="submit" variante="perigo" ocupado={excluindo} rotuloOcupado="Excluindo...">
            Excluir conta
          </Botao>
          <span className={estilos.explicacao}>Só é possível porque esta conta nunca recebeu categoria.</span>
        </form>
      ) : (
        <p className={estilos.explicacao}>
          Esta conta tem categorias e não pode ser excluída — o histórico delas perderia a classificação. Inative-a.
        </p>
      )}
    </div>
  );
}

export function FormularioCategoria({
  contas,
  categoria,
}: {
  readonly contas: readonly OpcaoConta[];
  readonly categoria?: {
    readonly id: string;
    readonly nome: string;
    readonly contaPlanoId: string;
    readonly ativa: boolean;
    readonly podeExcluir: boolean;
    readonly usos: number;
  };
}) {
  const [estado, enviar, pendente] = useActionState(acaoSalvarCategoria, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
  const editando = Boolean(categoria);

  return (
    <Dobra rotulo={editando ? "Editar" : "Nova categoria"} destaque={!editando}>
      <Resposta estado={estado} />
      <form action={enviar} {...guardaEnviar} className={estilos.formulario}>
        {categoria ? <input type="hidden" name="categoriaId" value={categoria.id} /> : null}

        <CampoFormulario id={`nome-categoria-${categoria?.id ?? "nova"}`} rotulo="Nome" obrigatorio {...erro("nome")}>
          {(a) => <ControleTexto {...a} name="nome" type="text" defaultValue={categoria?.nome ?? ""} placeholder="Energia elétrica" />}
        </CampoFormulario>

        <CampoFormulario
          id={`conta-${categoria?.id ?? "nova"}`}
          rotulo="Conta do plano"
          dica={
            editando && categoria!.usos > 0
              ? `Mudar a conta reclassifica os ${categoria!.usos} lançamentos que já usam esta categoria.`
              : "É a conta que decide em que linha do resultado isto entra."
          }
          obrigatorio
          {...erro("contaPlanoId")}
        >
          {(a) => (
            <select {...a} name="contaPlanoId" defaultValue={categoria?.contaPlanoId ?? ""}>
              <option value="" disabled>Escolha a conta</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>{conta.nome}</option>
              ))}
            </select>
          )}
        </CampoFormulario>

        <p>
          <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
            {editando ? "Salvar categoria" : "Criar categoria"}
          </Botao>
        </p>
      </form>

      {categoria ? <AcoesDaCategoria categoria={categoria} /> : null}
    </Dobra>
  );
}

function AcoesDaCategoria({
  categoria,
}: {
  readonly categoria: { readonly id: string; readonly ativa: boolean; readonly podeExcluir: boolean; readonly usos: number };
}) {
  const [estadoSituacao, alterarSituacao, alterando] = useActionState(acaoAlterarSituacaoCategoria, INICIAL);
  const guardaAlterarSituacao = useGuardaDoFormulario(estadoSituacao);
  const [estadoExclusao, excluir, excluindo] = useActionState(acaoExcluirCategoria, INICIAL);
  const guardaExcluir = useGuardaDoFormulario(estadoExclusao);

  return (
    <div className={estilos.secundarias}>
      <Resposta estado={estadoSituacao} />
      <Resposta estado={estadoExclusao} />

      <form action={alterarSituacao} {...guardaAlterarSituacao}>
        <input type="hidden" name="id" value={categoria.id} />
        <input type="hidden" name="ativa" value={categoria.ativa ? "nao" : "sim"} />
        <Botao type="submit" variante="secundario" ocupado={alterando} rotuloOcupado="Alterando...">
          {categoria.ativa ? "Inativar" : "Reativar"}
        </Botao>
        <span className={estilos.explicacao}>
          {categoria.ativa
            ? "Some dos formulários novos e continua nos lançamentos e relatórios antigos."
            : "Volta a aparecer ao lançar."}
        </span>
      </form>

      {categoria.podeExcluir ? (
        <form action={excluir} {...guardaExcluir}>
          <input type="hidden" name="id" value={categoria.id} />
          <Botao type="submit" variante="perigo" ocupado={excluindo} rotuloOcupado="Excluindo...">
            Excluir
          </Botao>
          <span className={estilos.explicacao}>Só é possível porque nunca foi usada.</span>
        </form>
      ) : (
        <p className={estilos.explicacao}>
          Já usada em {categoria.usos} {categoria.usos === 1 ? "lançamento" : "lançamentos"}: excluir apagaria a
          classificação deles e mudaria relatórios já fechados. Inative.
        </p>
      )}
    </div>
  );
}

/** Botao do plano padrao, com a previa do que sera criado. */
export function PlanoPadrao() {
  const [estado, enviar, pendente] = useActionState(acaoUsarPlanoPadrao, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const [confirmado, setConfirmado] = useState(false);

  return (
    <Dobra rotulo="Usar o plano padrão" destaque>
      <Resposta estado={estado} />
      <p className={estilos.explicacao}>
        Acrescenta as contas e categorias que ainda não existem, cobrindo todas as linhas do demonstrativo. O que você
        já criou ou renomeou fica exatamente como está, e apertar duas vezes não duplica nada.
      </p>
      <form
        action={enviar}
        {...guardaEnviar}
        onSubmit={(evento) => {
          guardaEnviar.onSubmit(evento);
          setConfirmado(true);
        }}
      >
        <Botao type="submit" variante="primario" ocupado={pendente || confirmado} rotuloOcupado="Aplicando...">
          Aplicar o plano padrão
        </Botao>
      </form>
    </Dobra>
  );
}
