# Provedores bancarios

Cada subpasta implementa `../contratos/provedor-bancario.ts` ou
`../contratos/leitor-extrato.ts` para um banco, agregador ou formato de arquivo.

```
provedores/
  ofx/            leitor de arquivo OFX (Gate 7)
  csv/            leitor de CSV com mapeamento de colunas (Gate 7)
  open-finance-x/ adaptador para um agregador de Open Finance (Fase 2)
```

Regras:
- SDKs e bibliotecas de bancos so podem ser importados dentro desta pasta.
  A verificacao de arquitetura (`pnpm verificar:arquitetura`) falha se um modulo
  financeiro importar algo daqui diretamente.
- Nunca implemente "scraping" (robo que acessa o internet banking). Apenas
  arquivos enviados pelo usuario e APIs oficiais.
- Todo provedor novo e uma integracao contratada separadamente (ver
  `docs/licenciamento.md`) e e ativado pelo portao de recursos.
