"use client";

import { useActionState } from "react";

import { Aviso, Botao, CampoFormulario, ControleTexto, SecaoFormulario } from "@/interface/componentes/indice";
import type { DadosDaEmpresa } from "@/nucleo/empresas/publico";

import { acaoSalvarEmpresa, type EstadoEmpresa } from "./acoes";
import estilos from "./empresa.module.css";

const INICIAL: EstadoEmpresa = {};

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
] as const;

/** Mostra o CNPJ como as pessoas leem; o servidor guarda so os digitos. */
function formatarCnpj(digitos: string | null): string {
  if (!digitos || digitos.length !== 14) return digitos ?? "";
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

function formatarCep(digitos: string | null): string {
  if (!digitos || digitos.length !== 8) return digitos ?? "";
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

export function FormularioEmpresa({ dados, hoje }: { readonly dados: DadosDaEmpresa; readonly hoje: string }) {
  const [estado, enviar, pendente] = useActionState(acaoSalvarEmpresa, INICIAL);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  return (
    <form action={enviar}>
      {estado.mensagem ? (
        <Aviso tom="perigo" titulo={estado.mensagem} urgente>Corrija o que está indicado e envie de novo.</Aviso>
      ) : null}
      {estado.sucesso ? <p className={estilos.sucesso} role="status">{estado.sucesso}</p> : null}

      <SecaoFormulario titulo="Identificação" explicacao="Como a empresa aparece em documentos e cobranças.">
        <CampoFormulario id="razaoSocial" rotulo="Razão social" obrigatorio {...erro("razaoSocial")}>
          {(a) => <ControleTexto {...a} name="razaoSocial" type="text" defaultValue={dados.razaoSocial} />}
        </CampoFormulario>

        <CampoFormulario id="nomeFantasia" rotulo="Nome fantasia" dica="É o nome que aparece no topo do sistema." {...erro("nomeFantasia")}>
          {(a) => <ControleTexto {...a} name="nomeFantasia" type="text" defaultValue={dados.nomeFantasia ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="cnpj" rotulo="CNPJ" dica="Pode digitar com pontos e barra." {...erro("cnpj")}>
          {(a) => <ControleTexto {...a} name="cnpj" type="text" inputMode="numeric" defaultValue={formatarCnpj(dados.cnpj)} placeholder="00.000.000/0000-00" />}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario titulo="Contato">
        <CampoFormulario id="email" rotulo="E-mail" {...erro("email")}>
          {(a) => <ControleTexto {...a} name="email" type="email" defaultValue={dados.email ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="telefone" rotulo="Telefone" {...erro("telefone")}>
          {(a) => <ControleTexto {...a} name="telefone" type="tel" defaultValue={dados.telefone ?? ""} placeholder="(35) 3531-0000" />}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario titulo="Endereço">
        <CampoFormulario id="cep" rotulo="CEP" {...erro("cep")}>
          {(a) => <ControleTexto {...a} name="cep" type="text" inputMode="numeric" defaultValue={formatarCep(dados.cep)} placeholder="37950-000" />}
        </CampoFormulario>

        <CampoFormulario id="logradouro" rotulo="Logradouro" {...erro("logradouro")}>
          {(a) => <ControleTexto {...a} name="logradouro" type="text" defaultValue={dados.logradouro ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="numero" rotulo="Número" {...erro("numero")}>
          {(a) => <ControleTexto {...a} name="numero" type="text" defaultValue={dados.numero ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="complemento" rotulo="Complemento" {...erro("complemento")}>
          {(a) => <ControleTexto {...a} name="complemento" type="text" defaultValue={dados.complemento ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="bairro" rotulo="Bairro" {...erro("bairro")}>
          {(a) => <ControleTexto {...a} name="bairro" type="text" defaultValue={dados.bairro ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="municipio" rotulo="Município" {...erro("municipio")}>
          {(a) => <ControleTexto {...a} name="municipio" type="text" defaultValue={dados.municipio ?? ""} />}
        </CampoFormulario>

        <CampoFormulario id="uf" rotulo="UF" {...erro("uf")}>
          {(a) => (
            <select {...a} name="uf" defaultValue={dados.uf ?? ""}>
              <option value="">—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          )}
        </CampoFormulario>
      </SecaoFormulario>

      <SecaoFormulario
        titulo="Data de corte"
        explicacao="O dia em que a empresa passou a usar o sistema. Separa o que veio de antes do que nasceu aqui."
      >
        <CampoFormulario
          id="dataInicioUso"
          rotulo="Início do uso do sistema"
          dica="A carga inicial usa esta data para os saldos bancários e para as contas em aberto. Não pode estar no futuro."
          {...erro("dataInicioUso")}
        >
          {(a) => <ControleTexto {...a} name="dataInicioUso" type="date" max={hoje} defaultValue={dados.dataInicioUso ?? ""} />}
        </CampoFormulario>
      </SecaoFormulario>

      <p>
        <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Salvando...">
          Salvar dados da empresa
        </Botao>
      </p>
    </form>
  );
}
