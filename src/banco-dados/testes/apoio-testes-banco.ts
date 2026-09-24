import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as esquema from "@/banco-dados/esquemas/indice";

/**
 * Apoio para testes de integracao com PostgreSQL real.
 *
 * Os testes rodam apenas quando `BANCO_URL_TESTE` esta definida (usuario da
 * APLICACAO, com migracoes aplicadas). Na CI, o servico PostgreSQL e criado,
 * as migracoes sao aplicadas e a variavel e exportada (ver .github/workflows/ci.yml).
 * Localmente: docker + scripts/banco/10-criar-usuarios.sh + pnpm banco:migrar.
 */
export const urlBancoTeste = process.env.BANCO_URL_TESTE;

/*
 * O banco de testes nao pode ser o de desenvolvimento.
 *
 * As suites de integracao escrevem de verdade — criam empresas, gravam
 * lancamentos e apagam tudo ao fim. Apontadas para o banco de trabalho, elas
 * fazem o cadastro de quem esta usando o sistema sumir no meio de uma
 * conferencia, e transformam sobra de teste em dado "real". A checagem fica
 * aqui, e nao num teste, porque precisa valer antes de a primeira suite rodar.
 */
if (urlBancoTeste && process.env.BANCO_URL && bancoDaUrl(urlBancoTeste) === bancoDaUrl(process.env.BANCO_URL)) {
  throw new Error(
    `BANCO_URL_TESTE aponta para o mesmo banco de BANCO_URL ("${bancoDaUrl(urlBancoTeste)}"). ` +
      "Os testes apagariam os dados de desenvolvimento. Rode `pnpm banco:preparar-teste`.",
  );
}

/** Nome do banco e host de uma URL de conexao, sem as credenciais. */
function bancoDaUrl(url: string): string {
  try {
    const analisada = new URL(url);
    return `${analisada.host}${analisada.pathname}`;
  } catch {
    return url;
  }
}

export function criarBancoTeste(maximoConexoes = 8) {
  const cliente = postgres(urlBancoTeste ?? "", { max: maximoConexoes });
  const banco = drizzle(cliente, { schema: esquema, casing: "snake_case" });
  return { banco, cliente };
}

export type BancoTeste = ReturnType<typeof criarBancoTeste>["banco"];
export type ExecutorTeste = BancoTeste | Parameters<Parameters<BancoTeste["transaction"]>[0]>[0];

class DescartarTransacao extends Error {}

/**
 * Executa `operacao` dentro de uma transacao e a DESFAZ ao final, mesmo em
 * sucesso. Cada teste enxerga um banco limpo sem precisar apagar nada.
 */
export async function emTransacaoDescartavel(banco: BancoTeste, operacao: (executor: ExecutorTeste) => Promise<void>): Promise<void> {
  try {
    await banco.transaction(async (transacao) => {
      await operacao(transacao);
      throw new DescartarTransacao();
    });
  } catch (erro) {
    if (!(erro instanceof DescartarTransacao)) throw erro;
  }
}

/** Codigo SQLSTATE do PostgreSQL de um erro lancado pelo Drizzle/postgres-js. */
export function codigoErroPostgres(erro: unknown): string | undefined {
  const qualquer = erro as { code?: string; cause?: { code?: string } };
  return qualquer?.cause?.code ?? qualquer?.code;
}

/** Codigos SQLSTATE usados nos testes, com nome em portugues. */
export const ERRO_POSTGRES = {
  violacaoChaveEstrangeira: "23503",
  violacaoUnicidade: "23505",
  violacaoCheck: "23514",
  violacaoNaoNulo: "23502",
  privilegioInsuficiente: "42501",
} as const;

/**
 * Espera que `operacao` falhe com o SQLSTATE informado.
 *
 * Roda a operacao dentro de um SAVEPOINT (transacao aninhada): apos um erro,
 * o PostgreSQL aborta a transacao inteira ("current transaction is aborted");
 * o savepoint permite voltar ao ponto anterior e continuar o teste.
 */
export async function esperarErroPostgres(executor: ExecutorTeste, operacao: () => Promise<unknown>, codigo: string): Promise<void> {
  let capturado: unknown;
  try {
    await executor.transaction(async () => {
      await operacao();
    });
  } catch (erro) {
    capturado = erro;
  }
  if (capturado === undefined) {
    throw new Error(`Esperava erro PostgreSQL ${codigo}, mas a operacao teve sucesso.`);
  }
  const recebido = codigoErroPostgres(capturado);
  if (recebido !== codigo) {
    throw new Error(`Esperava erro PostgreSQL ${codigo}, recebido ${recebido ?? "desconhecido"}: ${(capturado as Error).message}`);
  }
}

export interface CenarioBase {
  organizacaoId: string;
  empresaId: string;
  filialId: string;
  pessoaFornecedorId: string;
  fornecedorId: string;
  pessoaClienteId: string;
  clienteId: string;
  contaPlanoId: string;
  categoriaId: string;
  centroCustoId: string;
  instituicaoId: string;
  contaBancariaId: string;
  contaCaixaId: string;
}

/** Cria a estrutura minima para testar tabelas financeiras. Usa nomes unicos por chamada. */
export async function criarCenarioBase(executor: ExecutorTeste, sufixo = crypto.randomUUID().slice(0, 8)): Promise<CenarioBase> {
  const [organizacao] = await executor.insert(esquema.organizacoes).values({ nome: `Org ${sufixo}` }).returning();
  const [empresa] = await executor
    .insert(esquema.empresas)
    .values({ organizacaoId: organizacao!.id, nome: `Empresa ${sufixo}` })
    .returning();
  const [filial] = await executor.insert(esquema.filiais).values({ empresaId: empresa!.id, nome: `Filial ${sufixo}` }).returning();
  const [pessoaFornecedor] = await executor
    .insert(esquema.pessoas)
    .values({ organizacaoId: organizacao!.id, tipo: "juridica", nome: `Fornecedor ${sufixo}` })
    .returning();
  const [fornecedor] = await executor
    .insert(esquema.fornecedores)
    .values({ empresaId: empresa!.id, pessoaId: pessoaFornecedor!.id })
    .returning();
  const [pessoaCliente] = await executor
    .insert(esquema.pessoas)
    .values({ organizacaoId: organizacao!.id, tipo: "fisica", nome: `Cliente ${sufixo}` })
    .returning();
  const [cliente] = await executor.insert(esquema.clientes).values({ empresaId: empresa!.id, pessoaId: pessoaCliente!.id }).returning();
  const [contaPlano] = await executor
    .insert(esquema.contasPlano)
    .values({ empresaId: empresa!.id, codigo: "3.2.01", nome: "Despesas operacionais", grupoDre: "despesa_operacional" })
    .returning();
  const [categoria] = await executor
    .insert(esquema.categoriasFinanceiras)
    .values({ empresaId: empresa!.id, nome: `Energia ${sufixo}`, contaPlanoId: contaPlano!.id, naturezaCusto: "fixo" })
    .returning();
  const [centroCusto] = await executor
    .insert(esquema.centrosCusto)
    .values({ empresaId: empresa!.id, codigo: "01", nome: "Administrativo" })
    .returning();
  const [instituicao] = await executor.insert(esquema.instituicoesBancarias).values({ nome: `Banco Teste ${sufixo}` }).returning();
  const [contaBancaria] = await executor
    .insert(esquema.contasBancarias)
    .values({
      empresaId: empresa!.id,
      tipo: "conta_corrente",
      nome: `BB ${sufixo}`,
      instituicaoBancariaId: instituicao!.id,
      saldoInicial: "1000.00",
      dataSaldoInicial: "2026-01-01",
    })
    .returning();
  const [contaCaixa] = await executor
    .insert(esquema.contasBancarias)
    .values({ empresaId: empresa!.id, tipo: "caixa", nome: `Caixa ${sufixo}`, saldoInicial: "0.00", dataSaldoInicial: "2026-01-01" })
    .returning();

  return {
    organizacaoId: organizacao!.id,
    empresaId: empresa!.id,
    filialId: filial!.id,
    pessoaFornecedorId: pessoaFornecedor!.id,
    fornecedorId: fornecedor!.id,
    pessoaClienteId: pessoaCliente!.id,
    clienteId: cliente!.id,
    contaPlanoId: contaPlano!.id,
    categoriaId: categoria!.id,
    centroCustoId: centroCusto!.id,
    instituicaoId: instituicao!.id,
    contaBancariaId: contaBancaria!.id,
    contaCaixaId: contaCaixa!.id,
  };
}

/** Cria um titulo a pagar aberto com uma parcela. Devolve ids. */
export async function criarTituloPagarComParcela(
  executor: ExecutorTeste,
  cenario: CenarioBase,
  opcoes: { valor?: string; codigo?: string } = {},
): Promise<{ tituloId: string; parcelaId: string }> {
  const valor = opcoes.valor ?? "100.00";
  const [titulo] = await executor
    .insert(esquema.titulosPagar)
    .values({
      empresaId: cenario.empresaId,
      codigo: opcoes.codigo ?? `CP-2026-${crypto.randomUUID().slice(0, 6)}`,
      fornecedorId: cenario.fornecedorId,
      descricao: "Conta de luz",
      dataCompetencia: "2026-08-01",
      valorTotal: valor,
      quantidadeParcelas: 1,
      categoriaId: cenario.categoriaId,
      situacao: "aberto",
    })
    .returning();
  const [parcela] = await executor
    .insert(esquema.parcelasPagar)
    .values({ tituloPagarId: titulo!.id, empresaId: cenario.empresaId, numeroParcela: 1, dataVencimento: "2026-09-10", valorOriginal: valor })
    .returning();
  return { tituloId: titulo!.id, parcelaId: parcela!.id };
}

/** Cria uma movimentacao de saida na conta bancaria do cenario. */
export async function criarMovimentacaoSaida(executor: ExecutorTeste, cenario: CenarioBase, valor = "100.00"): Promise<string> {
  const [movimentacao] = await executor
    .insert(esquema.movimentacoesBancarias)
    .values({
      empresaId: cenario.empresaId,
      contaBancariaId: cenario.contaBancariaId,
      dataMovimentacao: "2026-09-10",
      tipo: "saida",
      valor,
      descricao: "Pagamento conta de luz",
      origem: "pagamento",
    })
    .returning();
  return movimentacao!.id;
}

/** Cria um extrato com um item. */
export async function criarExtratoComItem(
  executor: ExecutorTeste,
  cenario: CenarioBase,
  opcoes: { impressaoArquivo?: string; identificadorExterno?: string; impressaoLinha?: string } = {},
): Promise<{ extratoId: string; itemId: string }> {
  const [extrato] = await executor
    .insert(esquema.extratosBancarios)
    .values({
      empresaId: cenario.empresaId,
      contaBancariaId: cenario.contaBancariaId,
      formato: "ofx",
      nomeArquivoOriginal: "extrato.ofx",
      impressaoDigital: opcoes.impressaoArquivo ?? crypto.randomUUID(),
      quantidadeItens: 1,
    })
    .returning();
  const [item] = await executor
    .insert(esquema.itensExtratoBancario)
    .values({
      extratoBancarioId: extrato!.id,
      contaBancariaId: cenario.contaBancariaId,
      dataMovimentacao: "2026-09-10",
      tipo: "saida",
      valor: "100.00",
      descricao: "PAGTO ENERGIA",
      identificadorExterno: opcoes.identificadorExterno ?? `FIT-${crypto.randomUUID().slice(0, 8)}`,
      impressaoDigitalLinha: opcoes.impressaoLinha ?? crypto.randomUUID(),
    })
    .returning();
  return { extratoId: extrato!.id, itemId: item!.id };
}

/** Apaga, na ordem certa, tudo que `criarCenarioBase` criou (para testes que precisam de dados confirmados). */
export async function apagarCenarioBase(banco: BancoTeste, cenario: CenarioBase): Promise<void> {
  const { sql } = await import("drizzle-orm");
  await banco.execute(sql`DELETE FROM itens_extrato_bancario WHERE conta_bancaria_id IN (${cenario.contaBancariaId}, ${cenario.contaCaixaId})`);
  await banco.execute(sql`DELETE FROM extratos_bancarios WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM movimentacoes_bancarias WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM contas_bancarias WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM instituicoes_bancarias WHERE id = ${cenario.instituicaoId}`);
  await banco.execute(sql`DELETE FROM sequencias_codigo WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM categorias_financeiras WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM contas_plano WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM centros_custo WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM fornecedores WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM clientes WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM pessoas WHERE organizacao_id = ${cenario.organizacaoId}`);
  await banco.execute(sql`DELETE FROM filiais WHERE empresa_id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM empresas WHERE id = ${cenario.empresaId}`);
  await banco.execute(sql`DELETE FROM organizacoes WHERE id = ${cenario.organizacaoId}`);
}
