"use client";

import { useActionState } from "react";

import { Dobra, Aviso, Botao, CampoFormulario, ControleTexto } from "@/interface/componentes/indice";
import { NOMES_PAPEIS, PAPEIS, type Papel } from "@/nucleo/autorizacao/publico";

import {
  acaoAlterarPapel,
  acaoAlterarSituacao,
  acaoCancelarConvite,
  acaoConvidar,
  acaoRedefinirAcesso,
  type EstadoUsuarios,
} from "./acoes";
import estilos from "./usuarios.module.css";

const INICIAL: EstadoUsuarios = {};

/**
 * Resposta de uma acao, incluindo o LINK quando houver.
 *
 * O link aparece uma vez so: o banco guarda o hash do token, nao o token. Por
 * isso ele vem em destaque, com o aviso de que nao volta — e nao escondido num
 * canto que a pessoa fecha sem ler.
 */
function Resposta({ estado }: { estado: EstadoUsuarios }) {
  if (estado.mensagem) {
    return <Aviso tom="perigo" titulo={estado.mensagem} urgente>Corrija e tente de novo.</Aviso>;
  }
  if (!estado.sucesso) return null;

  return (
    <div className={estilos.resposta} role="status">
      <p>{estado.sucesso}</p>
      {estado.link ? (
        <>
          <p className={estilos.aviso}>
            Copie o link agora: ele não volta a ser exibido. Se perder, gere outro em “Redefinir acesso”.
          </p>
          <input
            className={estilos.link}
            type="text"
            readOnly
            value={estado.link}
            aria-label="Link do convite"
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      ) : null}
    </div>
  );
}

export function ConviteNovo() {
  const [estado, enviar, pendente] = useActionState(acaoConvidar, INICIAL);
  const erro = (campo: string) => (estado.campos?.[campo]?.[0] ? { erro: estado.campos[campo]![0]! } : {});

  return (
    <Dobra rotulo="Convidar pessoa" destaque comCaixa={false}>
      <div className={estilos.corpoDaDobra}>
        <Resposta estado={estado} />
        <form action={enviar} className={estilos.formulario}>
          <CampoFormulario
            id="email-convite"
            rotulo="E-mail"
            dica="É para este endereço que o convite serve. A pessoa define a própria senha."
            obrigatorio
            {...erro("email")}
          >
            {(a) => <ControleTexto {...a} name="email" type="email" placeholder="pessoa@novadidata.com.br" />}
          </CampoFormulario>

          <CampoFormulario id="papel-convite" rotulo="Papel" obrigatorio {...erro("papel")}>
            {(a) => (
              <select {...a} name="papel" defaultValue="financeiro">
                {PAPEIS.map((papel) => <option key={papel} value={papel}>{NOMES_PAPEIS[papel]}</option>)}
              </select>
            )}
          </CampoFormulario>

          <p>
            <Botao type="submit" variante="primario" ocupado={pendente} rotuloOcupado="Criando...">
              Criar convite
            </Botao>
          </p>
        </form>
      </div>
    </Dobra>
  );
}

export function LinhaDeConvite({ conviteId }: { readonly conviteId: string }) {
  const [estado, enviar, pendente] = useActionState(acaoCancelarConvite, INICIAL);

  return (
    <div>
      <Resposta estado={estado} />
      <form action={enviar}>
        <input type="hidden" name="conviteId" value={conviteId} />
        <Botao type="submit" variante="secundario" ocupado={pendente} rotuloOcupado="Cancelando...">
          Cancelar convite
        </Botao>
      </form>
    </div>
  );
}

export function AcoesDoUsuario({
  usuario,
}: {
  readonly usuario: {
    readonly usuarioId: string;
    readonly nome: string;
    readonly papel: Papel;
    readonly ativo: boolean;
    readonly ehVoce: boolean;
  };
}) {
  const [estadoPapel, alterarPapel, alterandoPapel] = useActionState(acaoAlterarPapel, INICIAL);
  const [estadoSituacao, alterarSituacao, alterandoSituacao] = useActionState(acaoAlterarSituacao, INICIAL);
  const [estadoAcesso, redefinir, redefinindo] = useActionState(acaoRedefinirAcesso, INICIAL);

  return (
    <Dobra rotulo="Gerenciar" comCaixa={false}>
      <div className={estilos.corpoDaDobra}>
        <Resposta estado={estadoPapel} />
        <Resposta estado={estadoSituacao} />
        <Resposta estado={estadoAcesso} />

        <form action={alterarPapel} className={estilos.formulario}>
          <input type="hidden" name="usuarioId" value={usuario.usuarioId} />
          <CampoFormulario id={`papel-${usuario.usuarioId}`} rotulo="Papel">
            {(a) => (
              <select {...a} name="papel" defaultValue={usuario.papel}>
                {PAPEIS.map((papel) => <option key={papel} value={papel}>{NOMES_PAPEIS[papel]}</option>)}
              </select>
            )}
          </CampoFormulario>
          <p>
            <Botao type="submit" variante="secundario" ocupado={alterandoPapel} rotuloOcupado="Alterando...">
              Alterar papel
            </Botao>
          </p>
        </form>

        <form action={redefinir} className={estilos.secundaria}>
          <input type="hidden" name="usuarioId" value={usuario.usuarioId} />
          <Botao type="submit" variante="secundario" ocupado={redefinindo} rotuloOcupado="Gerando...">
            Redefinir acesso
          </Botao>
          <span className={estilos.explicacao}>
            Gera um link novo para {usuario.nome} definir outra senha. Ao ser usado, encerra as sessões abertas.
          </span>
        </form>

        {usuario.ehVoce ? (
          <p className={estilos.explicacao}>
            Você não pode desativar a si mesmo nem retirar a própria administração. Peça a outro administrador.
          </p>
        ) : (
          <form action={alterarSituacao} className={estilos.secundaria}>
            <input type="hidden" name="usuarioId" value={usuario.usuarioId} />
            <input type="hidden" name="ativo" value={usuario.ativo ? "nao" : "sim"} />
            <Botao
              type="submit"
              variante={usuario.ativo ? "perigo" : "secundario"}
              ocupado={alterandoSituacao}
              rotuloOcupado="Alterando..."
            >
              {usuario.ativo ? "Desativar acesso" : "Reativar acesso"}
            </Botao>
            <span className={estilos.explicacao}>
              {usuario.ativo
                ? "Encerra as sessões na hora. O histórico e a auditoria continuam apontando para esta pessoa — por isso ninguém é excluído."
                : "Devolve o acesso com o mesmo papel."}
            </span>
          </form>
        )}
      </div>
    </Dobra>
  );
}
