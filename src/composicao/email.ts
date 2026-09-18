import { EnviadorEmailConsole, type EnviadorEmail } from "@/integracoes/email/publico";
import { obterVariaveisAmbiente } from "@/nucleo/configuracao/publico";
import { criarRegistradorLogs } from "@/nucleo/observabilidade/publico";

/** Escolhe o enviador de e-mail. SMTP sera implementado no Gate 5. */
export function montarEnviadorEmail(): EnviadorEmail {
  const variaveis = obterVariaveisAmbiente();
  const logs = criarRegistradorLogs("email");
  if (variaveis.EMAIL_PROVEDOR === "smtp") {
    logs.aviso("EMAIL_PROVEDOR=smtp ainda nao implementado; usando modo console");
  }
  return new EnviadorEmailConsole(logs);
}
