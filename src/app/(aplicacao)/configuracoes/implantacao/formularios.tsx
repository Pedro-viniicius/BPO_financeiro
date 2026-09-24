"use client";

import { useActionState } from "react";

import { Dobra, Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";

import {
  acaoConferirContas,
  acaoConferirPessoas,
  acaoDesfazerLote,
  acaoImportarContas,
  acaoImportarPessoas,
  type EstadoImportacao,
} from "./acoes";
import estilos from "./implantacao.module.css";

const INICIAL: EstadoImportacao = {};

/**
 * A tabela de erros.
 *
 * Linha, coluna, motivo e o que estava escrito ali — nessa ordem, porque quem
 * corrige abre a planilha, vai ate a linha e procura a coluna. Uma mensagem
 * como "erro na importacao" obrigaria a conferir o arquivo inteiro.
 */
function Erros({ estado }: { estado: EstadoImportacao }) {
  if (!estado.erros?.length) return null;
  return (
    <div className={estilos.erros}>
      <table>
        <caption>Nada foi importado. Corrija a planilha e envie de novo.</caption>
        <thead>
          <tr>
            <th scope="col">Linha</th>
            <th scope="col">Coluna</th>
            <th scope="col">O que está errado</th>
            <th scope="col">O que está escrito</th>
          </tr>
        </thead>
        <tbody>
          {estado.erros.map((erro, indice) => (
            <tr key={`${erro.linha}-${erro.coluna}-${indice}`}>
              <td data-rotulo="Linha">{erro.linha}</td>
              <td data-rotulo="Coluna">{erro.coluna}</td>
              <td data-rotulo="O que está errado">{erro.motivo}</td>
              <td data-rotulo="O que está escrito">{erro.valor || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Resultado({ estado }: { estado: EstadoImportacao }) {
  if (estado.mensagem) {
    return (
      <Aviso tom="perigo" titulo={estado.mensagem} urgente>
        A importação é tudo ou nada: nenhuma linha foi gravada.
      </Aviso>
    );
  }
  if (estado.sucesso) return <p className={estilos.sucesso} role="status">{estado.sucesso}</p>;
  return null;
}

export function ImportarPlanilha({ tipo }: { readonly tipo: "pessoas" | "contas" }) {
  const conferir = tipo === "pessoas" ? acaoConferirPessoas : acaoConferirContas;
  const importar = tipo === "pessoas" ? acaoImportarPessoas : acaoImportarContas;

  const [conferencia, enviarConferencia, conferindo] = useActionState(conferir, INICIAL);
  const [importacao, enviarImportacao, importando] = useActionState(importar, INICIAL);

  // Depois de importar, a prévia não vale mais: o arquivo já entrou.
  const previa = importacao.sucesso ? undefined : conferencia.previa;

  return (
    <>
      <Resultado estado={importacao} />
      <Erros estado={importacao} />

      {previa ? null : (
        <>
          <Resultado estado={conferencia} />
          <Erros estado={conferencia} />
          <form action={enviarConferencia} className={estilos.formulario}>
            <CampoFormulario
              id="arquivo"
              rotulo="Planilha preenchida (CSV)"
              dica="No Excel: Arquivo → Salvar como → “CSV UTF-8”. O arquivo é conferido antes de qualquer gravação."
              obrigatorio
            >
              {(a) => <input {...a} type="file" name="arquivo" accept=".csv,text/csv" required />}
            </CampoFormulario>
            <p>
              <Botao type="submit" variante="primario" ocupado={conferindo} rotuloOcupado="Conferindo...">
                Conferir planilha
              </Botao>
            </p>
          </form>
        </>
      )}

      {previa ? (
        <div className={estilos.previa}>
          <h3>Confira antes de importar</h3>
          <p>
            <strong>{previa.total}</strong> linha(s) prontas, de <strong>{previa.arquivoNome}</strong>. Nenhum problema
            encontrado.
          </p>
          <ul>
            {previa.amostra.map((linha, indice) => <li key={indice}>{linha}</li>)}
            {previa.total > previa.amostra.length ? <li>…e mais {previa.total - previa.amostra.length}.</li> : null}
          </ul>
          <form action={enviarImportacao}>
            {/*
              O conteúdo volta ao servidor para ser validado OUTRA VEZ. Nada
              do que o navegador devolve é aceito como já conferido.
            */}
            <input type="hidden" name="conteudo" value={previa.conteudo} />
            <input type="hidden" name="arquivoNome" value={previa.arquivoNome} />
            <Botao type="submit" variante="primario" ocupado={importando} rotuloOcupado="Importando...">
              Importar {previa.total} linha(s)
            </Botao>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function DesfazerLote({
  loteId,
  arquivoNome,
  quantidade,
}: {
  readonly loteId: string;
  readonly arquivoNome: string;
  readonly quantidade: number;
}) {
  const [estado, enviar, pendente] = useActionState(acaoDesfazerLote, INICIAL);

  return (
    <Dobra rotulo="Desfazer" comCaixa={false}>
      <div className={estilos.corpoDaDobra}>
        <Resultado estado={estado} />
        <p className={estilos.detalhe}>
          Remove os {quantidade} registro(s) que <strong>{arquivoNome}</strong> criou. Só é possível porque nada deles
          foi usado ainda.
        </p>
        <form action={enviar} className={estilos.formulario}>
          <input type="hidden" name="loteId" value={loteId} />
          <CampoFormulario
            id={`motivo-${loteId}`}
            rotulo="Motivo"
            dica="Fica registrado: é ele que explica, depois, por que os dados mudaram."
            obrigatorio
          >
            {(a) => <ControleTexto {...a} name="motivo" type="text" placeholder="Planilha com a coluna trocada" />}
          </CampoFormulario>
          <p>
            <Botao type="submit" variante="perigo" ocupado={pendente} rotuloOcupado="Desfazendo...">
              Desfazer lote
            </Botao>
          </p>
        </form>
      </div>
    </Dobra>
  );
}
