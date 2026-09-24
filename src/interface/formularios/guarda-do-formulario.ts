"use client";

import { useEffect, useRef, type FormEvent } from "react";

/**
 * O que a pessoa digitou nao some quando o servidor recusa o envio.
 *
 * O PROBLEMA. Com `<form action={acao}>`, o React 19 reinicia o formulario
 * sempre que a acao termina — com sucesso ou com erro. Todo campo nao
 * controlado volta ao valor inicial. Numa conta a pagar recusada por um valor
 * com tres casas decimais, a pessoa via "Confira os campos destacados" e a
 * descricao, o fornecedor e a categoria em branco: tinha de digitar tudo de
 * novo para corrigir um campo.
 *
 * A DECISAO. O reinicio no SUCESSO e desejado e continua como esta: e ele que
 * esvazia um formulario de cadastro depois de salvar, e que impede que um
 * pagamento registrado deixe os mesmos valores prontos para um segundo envio.
 * So no ERRO os valores voltam: este gancho guarda o que foi enviado e, se o
 * estado devolvido pela acao for de erro, devolve cada valor ao seu campo
 * depois do reinicio.
 *
 * Uso:
 *
 *     const [estado, enviar, pendente] = useActionState(acao, INICIAL);
 *     const guarda = useGuardaDoFormulario(estado);
 *     <form action={enviar} {...guarda}>
 *
 * Quando o formulario ja tem `onSubmit` proprio (uma confirmacao, por
 * exemplo), passe-o como segundo argumento: os dois rodam, o dele depois.
 *
 * Senhas nao voltam, de proposito: e a convencao que as pessoas esperam, e o
 * navegador nao deve manter senha recusada em campo.
 */

/** Campos que nunca sao restaurados. `hidden` quem escreve e o React; senha, por convencao. */
const TIPOS_IGNORADOS = new Set(["hidden", "password", "submit", "button", "reset", "image"]);

/**
 * O estado devolvido pela acao representa erro?
 *
 * Todas as acoes do produto usam o mesmo formato: `mensagem` para o que deu
 * errado, `campos` para os erros por campo e, na implantacao, `erros` por
 * linha da planilha. Sucesso usa `sucesso` ou redireciona.
 */
export function houveErro(estado: unknown): boolean {
  if (!estado || typeof estado !== "object") return false;
  const { mensagem, campos, erros } = estado as { mensagem?: unknown; campos?: unknown; erros?: unknown };
  if (typeof mensagem === "string" && mensagem.trim() !== "") return true;
  if (campos && typeof campos === "object" && Object.keys(campos).length > 0) return true;
  return Array.isArray(erros) && erros.length > 0;
}

/**
 * Devolve a cada campo o valor que ele tinha no envio.
 *
 * Nomes repetidos (as linhas de parcelas, por exemplo) sao restaurados pela
 * ordem em que aparecem. Campos desabilitados ficam como estao: eles nem
 * entram no envio, entao "ausente" nao significa "vazio".
 */
export function restaurarFormulario(formulario: HTMLFormElement, dados: FormData): void {
  const valores = new Map<string, FormDataEntryValue[]>();
  dados.forEach((valor, nome) => {
    if (nome.startsWith("$ACTION")) return;
    const lista = valores.get(nome);
    if (lista) lista.push(valor);
    else valores.set(nome, [valor]);
  });

  const proximo = new Map<string, number>();
  const valorNaOrdem = (nome: string): FormDataEntryValue | undefined => {
    const indice = proximo.get(nome) ?? 0;
    proximo.set(nome, indice + 1);
    return valores.get(nome)?.[indice];
  };

  for (const elemento of Array.from(formulario.elements)) {
    if (elemento instanceof HTMLInputElement) {
      if (!elemento.name || elemento.disabled || TIPOS_IGNORADOS.has(elemento.type)) continue;
      const lista = valores.get(elemento.name) ?? [];

      if (elemento.type === "checkbox" || elemento.type === "radio") {
        elemento.checked = lista.some((valor) => valor === elemento.value);
        continue;
      }

      if (elemento.type === "file") {
        const arquivos = lista.filter((valor): valor is File => valor instanceof File && valor.size > 0);
        if (arquivos.length > 0 && typeof DataTransfer !== "undefined") {
          const transferencia = new DataTransfer();
          for (const arquivo of arquivos) transferencia.items.add(arquivo);
          elemento.files = transferencia.files;
        }
        continue;
      }

      const valor = valorNaOrdem(elemento.name);
      if (typeof valor === "string" && elemento.value !== valor) elemento.value = valor;
    } else if (elemento instanceof HTMLTextAreaElement) {
      if (!elemento.name || elemento.disabled) continue;
      const valor = valorNaOrdem(elemento.name);
      if (typeof valor === "string" && elemento.value !== valor) elemento.value = valor;
    } else if (elemento instanceof HTMLSelectElement) {
      if (!elemento.name || elemento.disabled) continue;
      if (elemento.multiple) {
        const escolhidos = (valores.get(elemento.name) ?? []).filter((valor): valor is string => typeof valor === "string");
        for (const opcao of Array.from(elemento.options)) opcao.selected = escolhidos.includes(opcao.value);
        continue;
      }
      const valor = valorNaOrdem(elemento.name);
      if (typeof valor === "string" && elemento.value !== valor) elemento.value = valor;
    }
  }
}

export interface GuardaDoFormulario {
  readonly ref: React.RefObject<HTMLFormElement | null>;
  readonly onSubmit: (evento: FormEvent<HTMLFormElement>) => void;
}

export function useGuardaDoFormulario(
  estado: unknown,
  aoEnviar?: (evento: FormEvent<HTMLFormElement>) => void,
): GuardaDoFormulario {
  const ref = useRef<HTMLFormElement>(null);
  const enviado = useRef<FormData | null>(null);

  useEffect(() => {
    const dados = enviado.current;
    enviado.current = null;
    // Roda depois do commit em que o React reiniciou o formulario: os valores
    // voltam por cima do reinicio, nunca antes dele.
    if (dados && ref.current && houveErro(estado)) restaurarFormulario(ref.current, dados);
  }, [estado]);

  return {
    ref,
    onSubmit: (evento) => {
      const formulario = evento.currentTarget;
      const quemEnviou = (evento.nativeEvent as SubmitEvent).submitter;
      enviado.current = quemEnviou ? new FormData(formulario, quemEnviou) : new FormData(formulario);
      aoEnviar?.(evento);
    },
  };
}
