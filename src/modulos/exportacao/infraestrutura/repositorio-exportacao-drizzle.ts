import { sql } from "drizzle-orm";

import { montarZip, somaDeVerificacao, type ArquivoDoZip } from "@/compartilhado/arquivos/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { BOM_UTF8, campoCsv, SEPARADOR_CSV } from "@/modulos/dre/publico";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type { PacoteExportado, RepositorioExportacao } from "../aplicacao/repositorio-exportacao";
import { CONJUNTOS } from "../dominio/conjunto-de-dados";

/**
 * Como cada valor vira celula.
 *
 * NUMERO com virgula decimal e sem simbolo de moeda: quem recebe vai somar e
 * filtrar, e "R$ 1.234,56" nao soma. DATA no formato ISO, que e o unico que
 * qualquer ferramenta le sem ambiguidade — 03/04 e marco ou abril conforme o
 * pais. JSON da auditoria em uma celula so, entre aspas.
 */
function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (typeof valor === "number") return String(valor).replace(".", ",");
  if (typeof valor === "object") return campoCsv(JSON.stringify(valor));

  const texto = String(valor);
  // NUMERIC chega como texto ("1234.56"): vira formato brasileiro.
  if (/^-?\d+\.\d+$/.test(texto)) return texto.replace(".", ",");
  return campoCsv(texto);
}

function paraCsv(linhas: readonly Record<string, unknown>[], colunas: readonly string[]): string {
  const cabecalho = colunas.join(SEPARADOR_CSV);
  const corpo = linhas.map((linha) => colunas.map((coluna) => celula(linha[coluna])).join(SEPARADOR_CSV));
  return BOM_UTF8 + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

/**
 * Troca `$1` e `$2` por parametros LIGADOS, nunca por texto concatenado.
 *
 * O texto da consulta e constante — escrito em `conjunto-de-dados.ts`, nunca
 * vindo de fora. Os dois ids vem do contexto do servidor, e ainda assim
 * entram como parametro: concatenar id em SQL e o habito que, no dia em que
 * um deles passar a vir de um parametro de rota, vira injecao. No Gate 7 isso
 * ja aconteceu uma vez neste projeto.
 */
function comParametros(consulta: string, escopo: EscopoEmpresa) {
  const pedacos = consulta.split(/(\$1|\$2)/);
  return sql.join(
    pedacos.map((pedaco) =>
      pedaco === "$1" ? sql`${escopo.empresaId}` : pedaco === "$2" ? sql`${escopo.organizacaoId}` : sql.raw(pedaco),
    ),
    sql``,
  );
}

export class RepositorioExportacaoDrizzle implements RepositorioExportacao {
  constructor(private readonly banco: ExecutorBancoDados) {}

  async exportar(escopo: EscopoEmpresa, usuarioId: string, agora = new Date()): Promise<PacoteExportado> {
    const arquivos: ArquivoDoZip[] = [];
    const resumo: { arquivo: string; linhas: number }[] = [];

    for (const conjunto of CONJUNTOS) {
      const linhas = await this.banco.execute<Record<string, unknown>>(
        comParametros(conjunto.consulta, escopo),
      );

      const colunas = linhas.length > 0 ? Object.keys(linhas[0]!) : [];
      arquivos.push({ nome: `dados/${conjunto.arquivo}.csv`, conteudo: paraCsv(linhas, colunas) });
      resumo.push({ arquivo: `${conjunto.arquivo}.csv`, linhas: linhas.length });
    }

    const [empresa] = await this.banco.execute<{ nome: string }>(sql`
      SELECT COALESCE(nome_fantasia, nome) AS nome FROM empresas WHERE id = ${escopo.empresaId}
    `);

    arquivos.unshift({ nome: "LEIAME.txt", conteudo: this.leiame(empresa?.nome ?? "—", agora, resumo) });

    const zip = montarZip(arquivos, agora);
    const nome = `financeiro-${(empresa?.nome ?? "empresa").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${agora.toISOString().slice(0, 10)}.zip`;

    await executarEmTransacao(async (transacao) => {
      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "dados.exportados",
        entidade: "empresa",
        entidadeId: escopo.empresaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosDepois: { arquivo: nome, arquivos: resumo.length, linhas: resumo.reduce((s, r) => s + r.linhas, 0) },
      });
    }, this.banco);

    return { nome, conteudo: zip, soma: somaDeVerificacao(zip), resumo };
  }

  private leiame(nomeEmpresa: string, agora: Date, resumo: readonly { arquivo: string; linhas: number }[]): string {
    const data = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const dicionario = CONJUNTOS.map((conjunto) => {
      const linhas = resumo.find((r) => r.arquivo === `${conjunto.arquivo}.csv`)?.linhas ?? 0;
      return [
        `${conjunto.arquivo}.csv  (${linhas} ${linhas === 1 ? "linha" : "linhas"})`,
        `    ${conjunto.descricao}`,
        conjunto.ligacoes ? `    Ligações: ${conjunto.ligacoes}` : "",
        "",
      ]
        .filter(Boolean)
        .join("\n");
    }).join("\n");

    return `EXPORTAÇÃO COMPLETA DE DADOS
${nomeEmpresa}
Gerado em ${data} (horário de Brasília)

================================================================
COMO LER ESTES ARQUIVOS
================================================================

Todos os arquivos estão na pasta "dados", em CSV, e abrem direto no Excel
em português:

  - codificação UTF-8 com BOM (acentos aparecem certos);
  - separador ponto e vírgula;
  - números com vírgula decimal e SEM símbolo de moeda, para poderem ser
    somados;
  - datas no formato AAAA-MM-DD, que qualquer ferramenta lê sem ambiguidade
    (03/04 é março ou abril conforme o país).

Os arquivos se ligam por COLUNAS DE ID. Por exemplo: para saber quanto falta
de um título a pagar, junte "titulos-a-pagar.csv" com "parcelas-a-pagar.csv"
pela coluna titulo_pagar_id, e depois com "baixas-de-pagamento.csv" pela
coluna parcela_pagar_id.

================================================================
O QUE NÃO ESTÁ AQUI, E POR QUÊ
================================================================

  - Senhas e tokens de acesso. São credenciais, não dados: exportá-las
    entregaria o acesso junto com a informação.
  - Tabelas de controle do próprio sistema (migrações, fila de tarefas,
    sequências de código).
  - Dados de outras empresas. Toda consulta filtra por esta empresa.

Os anexos (arquivos enviados) não vêm neste pacote: peça-os separadamente.

================================================================
DICIONÁRIO DOS ARQUIVOS
================================================================

${dicionario}
================================================================
CONFERÊNCIA
================================================================

Total de arquivos: ${resumo.length}
Total de linhas:   ${resumo.reduce((soma, r) => soma + r.linhas, 0)}

Se algum arquivo aparecer vazio, é porque não há aquele tipo de registro
nesta empresa — não é erro de exportação.
`;
  }
}
