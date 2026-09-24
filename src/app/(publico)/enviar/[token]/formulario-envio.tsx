import { MAXIMO_ARQUIVOS_POR_ENVIO, TAMANHO_MAXIMO_OBSERVACAO, TIPOS_ACEITOS_NA_CAPTURA } from "@/modulos/captura-documentos/publico";

import { CompressaoDeFotos } from "./compressao-de-fotos";
import { LeitorDeChave } from "./leitor-de-chave";
import estilos from "./envio.module.css";

const ACEITA = TIPOS_ACEITOS_NA_CAPTURA.join(",");

/**
 * Formulario NATIVO de envio: `method="post"` para um Route Handler, porque
 * acao de servidor tem teto de 1 MB de corpo e uma foto de celular tem de 2
 * a 5. Nada aqui depende de JavaScript.
 *
 * Dois campos de arquivo, de proposito:
 * - "Fotografar" tem `capture="environment"`: abre a camera traseira;
 * - "Escolher arquivo" NAO tem `capture`, porque com ele o Android nao deixa
 *   enviar PDF nem foto ja tirada.
 * O recebimento junta os dois num envio so.
 *
 * `accept` com os tres tipos e o que faz o iOS converter HEIC para JPEG na
 * origem. E dica para o seletor, nao validacao — a validacao e por conteudo,
 * no servidor (ADR-032).
 */
export function FormularioEnvio({ token }: { readonly token: string }) {
  return (
    <form
      id="formulario-envio"
      method="post"
      action={`/enviar/${token}/receber`}
      encType="multipart/form-data"
      className={estilos.formulario}
    >
      <CompressaoDeFotos formularioId="formulario-envio" />
      <div className={estilos.campo}>
        <label htmlFor="fotos" className={estilos.rotulo}>
          Fotografar
        </label>
        <p className={estilos.dica}>Abre a câmera. Pode tirar mais de uma foto: frente e verso, cada página.</p>
        <input id="fotos" name="fotos" type="file" accept={ACEITA} capture="environment" multiple className={estilos.arquivo} />
      </div>

      <div className={estilos.campo}>
        <label htmlFor="arquivos" className={estilos.rotulo}>
          Escolher arquivo
        </label>
        <p className={estilos.dica}>PDF ou foto já salva no aparelho. JPG, PNG e PDF, até 15 MB cada.</p>
        <input id="arquivos" name="arquivos" type="file" accept={ACEITA} multiple className={estilos.arquivo} />
      </div>

      <div className={estilos.campo}>
        <label htmlFor="chaveAcesso" className={estilos.rotulo}>
          Chave de acesso da nota <span className={estilos.opcional}>(opcional)</span>
        </label>
        <p className={estilos.dica}>
          Os 44 caracteres impressos na nota fiscal. Recibo e boleto não têm — deixe em branco. Se o aparelho conseguir, a chave é
          lida da foto sozinha.
        </p>
        <input
          id="chaveAcesso"
          name="chaveAcesso"
          type="text"
          maxLength={60}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className={`${estilos.texto} ${estilos.chave}`}
        />
        <LeitorDeChave campoChaveId="chaveAcesso" camposDeArquivo={["fotos", "arquivos"]} />
      </div>

      <div className={estilos.campo}>
        <label htmlFor="observacao" className={estilos.rotulo}>
          Observação <span className={estilos.opcional}>(opcional)</span>
        </label>
        <p className={estilos.dica}>Um recado curto: de quem é a nota, a que se refere.</p>
        <textarea id="observacao" name="observacao" rows={3} maxLength={TAMANHO_MAXIMO_OBSERVACAO} className={estilos.texto} />
      </div>

      <p className={estilos.dica}>Até {MAXIMO_ARQUIVOS_POR_ENVIO} arquivos por envio. Você recebe um número de protocolo na tela.</p>

      <button type="submit" className={estilos.botao}>
        Enviar
      </button>
    </form>
  );
}
