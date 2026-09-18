"use client";

import { useActionState } from "react";

import {
  AcoesFormularioSimples,
  Aviso,
  Botao,
  CampoFormulario,
  ControleTexto,
  FormularioSimples,
} from "@/interface/componentes/indice";
import type { EstadoFormularioInstalacao } from "@/nucleo/empresas/publico";

import { acaoInstalarPrimeiraEmpresa } from "./acoes";

const ESTADO_INICIAL: EstadoFormularioInstalacao = {};

export function FormularioPrimeiraEmpresa() {
  const [estado, enviar, pendente] = useActionState(acaoInstalarPrimeiraEmpresa, ESTADO_INICIAL);
  const erroDe = (campo: string) => {
    const mensagem = estado.campos?.[campo]?.[0];
    return mensagem ? { erro: mensagem } : {};
  };

  return (
    <FormularioSimples action={enviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>
          Corrija o que está marcado e envie de novo.
        </Aviso>
      ) : null}

      <CampoFormulario id="nome" rotulo="Nome da empresa" obrigatorio dica="Razão social ou o nome pelo qual você a conhece." {...erroDe("nome")}>
        {(atributos) => <ControleTexto {...atributos} name="nome" type="text" autoComplete="organization" autoFocus defaultValue={estado.valores?.nome ?? ""} />}
      </CampoFormulario>

      <CampoFormulario id="nomeFantasia" rotulo="Nome fantasia" dica="Como aparece para clientes. Opcional." {...erroDe("nomeFantasia")}>
        {(atributos) => <ControleTexto {...atributos} name="nomeFantasia" type="text" defaultValue={estado.valores?.nomeFantasia ?? ""} />}
      </CampoFormulario>

      <CampoFormulario id="cnpj" rotulo="CNPJ" dica="Opcional agora; pode ser preenchido depois em Configurações." {...erroDe("cnpj")}>
        {(atributos) => <ControleTexto {...atributos} name="cnpj" type="text" inputMode="numeric" placeholder="00.000.000/0000-00" defaultValue={estado.valores?.cnpj ?? ""} />}
      </CampoFormulario>

      <AcoesFormularioSimples>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Criando empresa...">
          Criar empresa e entrar
        </Botao>
      </AcoesFormularioSimples>
    </FormularioSimples>
  );
}
