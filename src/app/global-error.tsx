"use client";

/**
 * Ultima barreira: falha na propria casca da aplicacao.
 *
 * Este arquivo SUBSTITUI o `<html>` inteiro, entao nao pode usar nada do
 * sistema de design — se a casca quebrou, os estilos e componentes dela podem
 * ser exatamente o que quebrou. Por isso o estilo vem embutido: e feio de
 * proposito, e a alternativa e a tela branca do navegador.
 *
 * Na pratica quase nunca aparece. Existe para que "quase nunca" nao seja
 * "uma tela em branco sem explicacao".
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f9", color: "#1b1f24" }}>
        <main style={{ maxWidth: "34rem", margin: "12vh auto", padding: "0 1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>O sistema não conseguiu carregar</h1>
          <p style={{ lineHeight: 1.6, marginBottom: "0.75rem" }}>
            A falha foi ao montar a página, não em algo que você fez. Nenhum lançamento foi alterado.
          </p>
          <p style={{ lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Tente recarregar. Se continuar, avise o suporte
            {error.digest ? (
              <>
                {" "}
                e informe este código: <code style={{ background: "#e9edf2", padding: "0.1em 0.4em", borderRadius: 4 }}>{error.digest}</code>
              </>
            ) : (
              " e informe o horário em que aconteceu"
            )}
            .
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 1.25rem",
              border: "1px solid #1b4fd8",
              borderRadius: 6,
              background: "#1b4fd8",
              color: "#fff",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
