"use client";

import { useActionState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";
import { useGuardaDoFormulario } from "@/interface/formularios/guarda-do-formulario";

import { acaoCriarCategoria, acaoCriarPessoa, acaoSemearPlanoPadrao, type EstadoFormulario } from "./acoes";

const INICIAL: EstadoFormulario = {};

function usarErro(estado: EstadoFormulario) {
  return (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});
}

/**
 * Cadastro de pessoa com os papeis que ela exerce.
 *
 * Uma pessoa, dois papeis possiveis — e o modelo do Gate 3. Cadastrar "a
 * grafica" duas vezes, uma como cliente e outra como fornecedor, criaria dois
 * cadastros para a mesma empresa e dois historicos que nunca se encontram.
 */
export function FormularioPessoa() {
  const [estado, enviar, pendente] = useActionState(acaoCriarPessoa, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const erro = usarErro(estado);

  return (
    <form action={enviar} {...guardaEnviar}>
      {estado.sucesso ? <Aviso tom="sucesso" titulo={estado.sucesso} /> : null}
      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <CampoFormulario id="nome" rotulo="Nome ou razão social" obrigatorio {...erro("nome")}>
        {(a) => <ControleTexto {...a} name="nome" type="text" />}
      </CampoFormulario>

      <CampoFormulario id="tipo" rotulo="Tipo" obrigatorio>
        {(a) => (
          <select {...a} name="tipo" defaultValue="juridica">
            <option value="juridica">Pessoa jurídica (CNPJ)</option>
            <option value="fisica">Pessoa física (CPF)</option>
          </select>
        )}
      </CampoFormulario>

      <CampoFormulario id="cpfCnpj" rotulo="CPF ou CNPJ" dica="Só números; pode ficar em branco.">
        {(a) => <ControleTexto {...a} name="cpfCnpj" type="text" inputMode="numeric" />}
      </CampoFormulario>

      <CampoFormulario id="email" rotulo="E-mail">
        {(a) => <ControleTexto {...a} name="email" type="email" />}
      </CampoFormulario>

      <CampoFormulario id="telefone" rotulo="Telefone">
        {(a) => <ControleTexto {...a} name="telefone" type="tel" />}
      </CampoFormulario>

      <fieldset>
        <legend>Papéis nesta empresa</legend>
        <p>
          <label htmlFor="papelCliente">
            <input id="papelCliente" type="checkbox" name="papelCliente" /> Cliente — pode aparecer em contas a receber
          </label>
        </p>
        <p>
          <label htmlFor="papelFornecedor">
            <input id="papelFornecedor" type="checkbox" name="papelFornecedor" /> Fornecedor — pode aparecer em contas a pagar
          </label>
        </p>
        {estado.campos?.papelCliente?.[0] ? <p role="alert">{estado.campos.papelCliente[0]}</p> : null}
      </fieldset>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Cadastrar pessoa
        </Botao>
      </p>
    </form>
  );
}

export function FormularioCategoria({ contasPlano }: { readonly contasPlano: readonly { id: string; nome: string }[] }) {
  const [estado, enviar, pendente] = useActionState(acaoCriarCategoria, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);
  const erro = usarErro(estado);

  if (contasPlano.length === 0) {
    return <SemearPlano />;
  }

  return (
    <form action={enviar} {...guardaEnviar}>
      {estado.sucesso ? <Aviso tom="sucesso" titulo={estado.sucesso} /> : null}
      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <CampoFormulario id="nomeCategoria" rotulo="Nome da categoria" dica="Ex.: Energia elétrica, Material de limpeza." obrigatorio {...erro("nome")}>
        {(a) => <ControleTexto {...a} name="nome" type="text" />}
      </CampoFormulario>

      <CampoFormulario id="contaPlanoId" rotulo="Conta do plano de contas" obrigatorio {...erro("contaPlanoId")}>
        {(a) => (
          <select {...a} name="contaPlanoId" defaultValue="">
            <option value="" disabled>Escolha uma conta</option>
            {contasPlano.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        )}
      </CampoFormulario>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Criar categoria
        </Botao>
      </p>
    </form>
  );
}


/**
 * Empresa nova nasce sem plano de contas — e sem plano nao ha categoria, sem
 * categoria nao ha conta a pagar nem a receber. Em vez de travar o usuario num
 * beco, a tela oferece o ponto de partida em um clique, dizendo o que vai criar.
 */
function SemearPlano() {
  const [estado, enviar, pendente] = useActionState(acaoSemearPlanoPadrao, INICIAL);
  const guardaEnviar = useGuardaDoFormulario(estado);

  return (
    <form action={enviar} {...guardaEnviar}>
      {estado.sucesso ? <Aviso tom="sucesso" titulo={estado.sucesso} /> : null}
      {estado.mensagem ? <Aviso tom="perigo" titulo={estado.mensagem} urgente /> : null}

      <Aviso tom="informacao" titulo="Esta empresa ainda não tem plano de contas">
        Toda conta a pagar ou a receber precisa de uma categoria, e toda categoria pertence a uma conta do plano — é o que
        faz cada lançamento aparecer no lugar certo nos relatórios. Podemos criar um ponto de partida enxuto: receitas,
        pessoal, ocupação, administrativas, impostos e financeiras. Você ajusta depois.
      </Aviso>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Criando...">
          Criar plano de contas inicial
        </Botao>
      </p>
    </form>
  );
}
