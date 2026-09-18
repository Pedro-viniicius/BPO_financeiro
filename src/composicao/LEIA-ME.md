# composicao/

Raiz de composicao ("composition root"): o unico lugar do sistema que decide
QUAL implementacao concreta usar para cada contrato — provedor de IA, envio
de e-mail, armazenamento de arquivos, provedores bancarios.

E aqui que a configuracao (variaveis de ambiente, licenca) vira objetos
prontos para os modulos usarem. Por isso esta pasta pode importar
`integracoes/*/provedores/`; nenhum modulo pode.
