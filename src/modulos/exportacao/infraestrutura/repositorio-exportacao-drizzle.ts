import { sql } from "drizzle-orm";

import { montarZip, somaDeVerificacao, type ArquivoDoZip } from "@/compartilhado/arquivos/indice";
import { comoIdentificador } from "@/compartilhado/tipos/identificadores";
import type { EscopoEmpresa } from "@/compartilhado/tipos/indice";
import { BOM_UTF8, campoCsv, SEPARADOR_CSV } from "@/modulos/dre/publico";
import { RegistradorAuditoriaDrizzle } from "@/nucleo/auditoria/publico";
import { executarEmTransacao, type ExecutorBancoDados } from "@/nucleo/banco-dados/publico";

import type { PacoteExportado, ParteDeAnexos, RepositorioExportacao } from "../aplicacao/repositorio-exportacao";
import { montarParteDeAnexos, type AnexoParaExportar } from "../dominio/parte-de-anexos";
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
  /*
   * NUMERIC e BIGINT chegam como texto ("1234.56", "-12"): viram formato
   * brasileiro e escapam de `campoCsv`. SO o que e numero de verdade passa
   * por aqui — qualquer outro texto, inclusive um que comece com `-`, `+`,
   * `=` ou `@`, vai para `campoCsv`, que neutraliza formula.
   */
  if (/^-?\d+(\.\d+)?$/.test(texto)) return texto.replace(".", ",");
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

    const partes = await this.listarPartesDeAnexos(escopo);
    arquivos.unshift({ nome: "LEIAME.txt", conteudo: this.leiame(empresa?.nome ?? "—", agora, resumo, partes) });

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

  async listarPartesDeAnexos(escopo: EscopoEmpresa): Promise<readonly ParteDeAnexos[]> {
    const linhas = await this.banco.execute<{ mes: string; arquivos: number; bytes: string }>(sql`
      SELECT to_char(a.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
             count(*)::int AS arquivos,
             sum(a.tamanho_bytes)::text AS bytes
      FROM arquivos a
      WHERE a.empresa_id = ${escopo.empresaId} AND a.removido_em IS NULL
        AND EXISTS (SELECT 1 FROM anexos_documentos_capturados x WHERE x.arquivo_id = a.id)
      GROUP BY 1 ORDER BY 1 DESC
    `);
    return linhas.map((l) => ({ mes: l.mes, arquivos: l.arquivos, bytes: Number(l.bytes) }));
  }

  async exportarAnexosDoMes(
    escopo: EscopoEmpresa,
    mes: string,
    usuarioId: string,
    obterConteudo: (chave: string) => Promise<Uint8Array | null>,
    agora = new Date(),
  ): Promise<PacoteExportado> {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes invalido.");
    const linhas = await this.banco.execute<{
      codigo: string; ordem: number; nome_original: string; tipo_conteudo: string; tamanho_bytes: string; impressao_digital: string; chave_armazenamento: string;
    }>(sql`
      SELECT d.codigo, x.ordem, a.nome_original, a.tipo_conteudo, a.tamanho_bytes::text, a.impressao_digital, a.chave_armazenamento
      FROM anexos_documentos_capturados x
      JOIN documentos_capturados d ON d.id = x.documento_id
      JOIN arquivos a ON a.id = x.arquivo_id
      WHERE a.empresa_id = ${escopo.empresaId} AND d.empresa_id = ${escopo.empresaId} AND a.removido_em IS NULL
        AND to_char(a.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${mes}
      ORDER BY d.codigo, x.ordem
    `);

    const anexos: AnexoParaExportar[] = [];
    for (const linha of linhas) {
      const conteudo = await obterConteudo(linha.chave_armazenamento);
      // Linha viva sem conteudo e exatamente o que o backup deve impedir; aqui vira erro, nao pacote incompleto.
      if (!conteudo) throw new Error(`Conteudo ausente no armazenamento para ${linha.codigo} (${linha.nome_original}).`);
      anexos.push({
        codigoDocumento: linha.codigo,
        ordem: linha.ordem,
        nomeOriginal: linha.nome_original,
        tipoConteudo: linha.tipo_conteudo,
        tamanhoBytes: Number(linha.tamanho_bytes),
        impressaoDigital: linha.impressao_digital,
        conteudo,
      });
    }

    const [empresa] = await this.banco.execute<{ nome: string }>(sql`
      SELECT COALESCE(nome_fantasia, nome) AS nome FROM empresas WHERE id = ${escopo.empresaId}
    `);
    const nomeEmpresa = empresa?.nome ?? "empresa";
    const { zip, quantidade, bytes } = montarParteDeAnexos(mes, nomeEmpresa, anexos, agora);
    const nome = `financeiro-${nomeEmpresa.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-anexos-${mes}.zip`;

    await executarEmTransacao(async (transacao) => {
      await new RegistradorAuditoriaDrizzle(transacao).registrar({
        acao: "dados.exportados",
        entidade: "empresa",
        entidadeId: escopo.empresaId,
        organizacaoId: escopo.organizacaoId,
        empresaId: escopo.empresaId,
        usuarioId: comoIdentificador<"Usuario">(usuarioId),
        origem: "interface",
        dadosDepois: { arquivo: nome, parte: mes, anexos: quantidade, bytes },
      });
    }, this.banco);

    return { nome, conteudo: zip, soma: somaDeVerificacao(zip), resumo: [{ arquivo: `anexos ${mes}`, linhas: quantidade }] };
  }

  private leiame(nomeEmpresa: string, agora: Date, resumo: readonly { arquivo: string; linhas: number }[], partes: readonly ParteDeAnexos[] = []): string {
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

Os anexos (arquivos enviados pelo QR code) saem em pacotes SEPARADOS, um por
mês, na mesma tela de exportação, sem compressão e com a soma SHA-256 de cada
arquivo. Este pacote de dados referencia os documentos pelo protocolo
(DC-AAAA-NNNNNN), que é o nome da pasta dentro de cada parte.
${partes.length === 0 ? "Partes disponíveis: nenhuma (nenhum anexo ainda)." : `Partes disponíveis:\n${partes.map((p) => `  - ${p.mes}: ${p.arquivos} arquivo(s), ${p.bytes} bytes`).join("\n")}`}

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
