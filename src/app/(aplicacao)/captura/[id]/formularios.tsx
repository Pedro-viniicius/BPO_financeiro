"use client";

import { useActionState } from "react";

import { Aviso, Botao, CampoDinheiro, CampoFormulario, ControleTexto, Dobra, SecaoFormulario } from "@/interface/componentes/indice";

import { acaoAprovar, acaoReabrir, acaoRejeitar, type EstadoConferencia } from "../acoes";
import estilos from "../captura.module.css";

const INICIAL: EstadoConferencia = {};

export interface Opcao {
  readonly id: string;
  readonly nome: string;
}

export interface DadosParaAprovar {
  readonly documentoId: string;
  readonly descricaoSugerida: string;
  readonly chaveAcesso: string | null;
  readonly hoje: string;
  readonly fornecedores: readonly Opcao[];
  readonly categorias: readonly Opcao[];
  /** Falso quando a pessoa confere mas nao cria conta a pagar: o formulario aparece, o botao explica. */
  readonly podeAprovar: boolean;
}

function Erro({ estado }: { estado: EstadoConferencia }) {
  return estado.mensagem ? (
    <Aviso tom="perigo" titulo={estado.mensagem} urgente>
      Nada foi alterado.
    </Aviso>
  ) : null;
}

/**
 * Aprovacao: a classificacao vira uma conta a pagar de UMA parcela, no mesmo
 * estado inicial de uma lancada a mao. Tudo em formulario nativo.
 */
export function FormularioAprovacao({ dados }: { readonly dados: DadosParaAprovar }) {
  const [estado, enviar, pendente] = useActionState(acaoAprovar, INICIAL);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  return (
    <SecaoFormulario titulo="Aprovar: classificar e criar a conta a pagar" explicacao="A conta nasce em aberto, como qualquer outra. Aprovar o título para pagamento continua sendo etapa do Contas a pagar.">
      <form action={enviar} className={estilos.formulario}>
        <input type="hidden" name="documentoId" value={dados.documentoId} />
        <Erro estado={estado} />

        <CampoFormulario id="descricao" rotulo="Descrição" obrigatorio {...erro("descricao")}>
          {(a) => <ControleTexto {...a} name="descricao" type="text" defaultValue={dados.descricaoSugerida} />}
        </CampoFormulario>

        <CampoFormulario id="fornecedorId" rotulo="Fornecedor" obrigatorio {...erro("fornecedorId")}>
          {(a) => (
            <select {...a} name="fornecedorId" defaultValue="">
              <option value="" disabled>Escolha…</option>
              {dados.fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario id="categoriaId" rotulo="Categoria (plano de contas)" obrigatorio {...erro("categoriaId")}>
          {(a) => (
            <select {...a} name="categoriaId" defaultValue="">
              <option value="" disabled>Escolha…</option>
              {dados.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
        </CampoFormulario>

        <CampoFormulario id="valor" rotulo="Valor total" dica="Lido no documento. Sem OCR: quem confere digita." obrigatorio {...erro("valor")}>
          {(a) => <CampoDinheiro {...a} name="valor" valor="" />}
        </CampoFormulario>

        <CampoFormulario id="dataVencimento" rotulo="Vencimento" obrigatorio {...erro("dataVencimento")}>
          {(a) => <ControleTexto {...a} name="dataVencimento" type="date" />}
        </CampoFormulario>

        <CampoFormulario id="dataCompetencia" rotulo="Competência" dica="O mês a que a despesa pertence. Entra no prazo de guarda do documento." obrigatorio {...erro("dataCompetencia")}>
          {(a) => <ControleTexto {...a} name="dataCompetencia" type="date" defaultValue={dados.hoje} />}
        </CampoFormulario>

        <CampoFormulario id="chaveAcesso" rotulo="Chave de acesso (NF-e/NFC-e)" dica="44 posições. Opcional: recibo e boleto não têm." {...erro("chaveAcesso")}>
          {(a) => <ControleTexto {...a} name="chaveAcesso" type="text" defaultValue={dados.chaveAcesso ?? ""} maxLength={44} style={{ textTransform: "uppercase" }} autoCapitalize="characters" spellCheck={false} />}
        </CampoFormulario>

        <CampoFormulario id="observacoes" rotulo="Observações da conta">
          {(a) => <ControleTexto {...a} name="observacoes" type="text" />}
        </CampoFormulario>

        <div className={estilos.acoes}>
          <Botao
            type="submit"
            variante="primario"
            ocupado={pendente}
            rotuloOcupado="Aprovando..."
            disabled={!dados.podeAprovar}
            {...(!dados.podeAprovar ? { motivoDesabilitado: "Aprovar cria uma conta a pagar, e o seu acesso não permite criar contas a pagar." } : {})}
          >
            Aprovar e criar a conta a pagar
          </Botao>
        </div>
      </form>
    </SecaoFormulario>
  );
}

export function FormularioRejeicao({ documentoId }: { readonly documentoId: string }) {
  const [estado, enviar, pendente] = useActionState(acaoRejeitar, INICIAL);
  return (
    <Dobra rotulo="Rejeitar este documento" comCaixa={false}>
      <form action={enviar} className={estilos.formulario}>
        <input type="hidden" name="documentoId" value={documentoId} />
        <Erro estado={estado} />
        <CampoFormulario id="motivo" rotulo="Motivo" dica="Quem enviou vai precisar entender: ilegível, duplicado, não é desta empresa..." obrigatorio>
          {(a) => <textarea {...a} name="motivo" rows={3} maxLength={500} required />}
        </CampoFormulario>
        <div className={estilos.acoes}>
          <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Rejeitando...">Rejeitar</Botao>
        </div>
      </form>
    </Dobra>
  );
}

export function FormularioReabertura({ documentoId }: { readonly documentoId: string }) {
  const [estado, enviar, pendente] = useActionState(acaoReabrir, INICIAL);
  return (
    <form action={enviar} className={estilos.formulario}>
      <input type="hidden" name="documentoId" value={documentoId} />
      <Erro estado={estado} />
      <div className={estilos.acoes}>
        <Botao type="submit" variante="secundario" ocupado={pendente} rotuloOcupado="Reabrindo...">Reabrir e voltar para a fila</Botao>
      </div>
    </form>
  );
}
