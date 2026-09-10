# Ofertas — execução do plano de produção

Plano aprovado em 10/09/2026. Implementação incremental; este documento não representa autorização de deploy, migrations remotas ou ativação de ofertas.

## Decisões aprovadas

- Vitrine com destaques compactos e preço promocional integrado ao catálogo.
- Configuração individual de cada unidade do combo; repetir a quantidade do combo repete sua composição.
- Identificação verificada para benefícios limitados por pessoa, mantendo a compra comum como visitante.
- Cobertura futura de toda a jornada e dos sete tipos de oferta, incluindo dashboard.
- Preservar o trabalho preexistente de Fidelidade V3, sem misturá-lo aos commits de ofertas.

## Etapa 1 — correções da vitrine e configuradores

Implementado:

- Imagens com contêiner dimensionado, fallback e respeito à opção de esconder fotos.
- Correção do acesso a campos de combo quando uma promoção de produto não tem foto.
- Vitrine alinhada à largura do catálogo, faixa de até seis destaques e botão para ver todas.
- Busca também filtra as ofertas por título, descrição e componentes.
- Preço promocional nas categorias e destaques, abertura do produto e ordenação por preço.
- Preço inicial de combos considera deltas e os adicionais obrigatórios mais baratos; escolha flexível inicial de menor preço. Sem promessa de economia fixa para escolhas variáveis.
- Opções roláveis, rodapé de compra independente, fechamento sempre acessível e controles de quantidade de pelo menos 44 px.
- Tokens da loja, foco de retorno à oferta, IDs únicos dos grupos de opções e limite de 500 caracteres nas observações.
- Validação de grupos obrigatórios com mínimo zero e de mínimos condicionais em grupos opcionais alinhada ao validador existente.

A cotação do servidor continua sendo a autoridade. Esta etapa não altera os contratos de combo, limites, modalidades ou a seleção de ofertas no servidor.

### Validação reproduzível

- Testes de componente: `npm test -- tests/unit/storefront-offers.test.tsx tests/unit/offer-presentation.test.ts tests/unit/catalog-view.test.tsx tests/unit/catalog-filter.test.ts`
- Layout dos componentes reais sem banco: `npx playwright test --config=playwright.offers.config.ts`. Fixture explicitamente identificada como teste, fora das rotas de produção; somente o adaptador de imagem do Next é substituído. Exercita CSS e componentes reais em 320×640, 390×844, 768×600 e 1280×720, com axe no modal.
- Aplicação real: definir `E2E_OFFERS_STORE_SLUG`, opcionalmente `E2E_OFFERS_COMBO_NAME`, e rodar `npx playwright test tests/e2e/storefront-offers-real.spec.ts --project=chromium`. Requer loja de testes com combo ativo e imagens habilitadas; não envia pedidos.
- Capturas geradas ficam em `test-results`, ignorado pelo Git. Não substituir testes reais por protótipos estáticos.

Limitação do ambiente: a prévia usando `.env.local` abriu Burger do Zé sem ofertas e registrou erro Prisma P2022 (coluna ausente). Não foi feita alteração no banco. Portanto, a verificação isolada não comprova integração com o staging nem funcionamento de pedidos reais. A causa exata do P2022 ainda precisa ser diagnosticada antes de qualquer migration.

Resultados desta etapa: 107 testes aprovados em 11 arquivos, executados com `--maxWorkers=1`; quatro testes de layout em navegador aprovados; axe sem violações no modal nos quatro tamanhos; lint dos arquivos alterados sem erros nem avisos; build final do Next aprovado, incluindo TypeScript e geração das páginas. O build precisou de acesso à rede para obter as fontes externas. Uma execução unitária paralela teve dois timeouts de cinco segundos; ambos passaram na execução sequencial, sem relaxar o timeout. Não foi executada a suíte completa do projeto nem o build OpenNext. As capturas verificam imagem/fallback e geometria no ambiente isolado, não o carregamento de assets pelo Worker de staging.

## Próximas etapas pendentes

1. **Motor canônico e preços:** `StoreOffer` como fonte primária, adaptação legada por ID, elegibilidade por modalidade/agenda, conflitos limitados às linhas relevantes, agregação de quantidades entre linhas do mesmo produto, limites por aplicação e rateio determinístico em centavos.
2. **Configuração por unidade:** intenção versionada com grupo/componente, índice da unidade, escolha, adicionais e observações; expansão compatível dos carrinhos antigos; atualização do quote, snapshots e edição na sacola.
3. **Limites por identidade verificada:** ledger vinculado à identidade, migração aditiva, backfill somente seguro, reserva/consumo/liberação idempotentes e testes concorrentes. Não assumir que telefone informado prova identidade.
4. **Contrato público dos sete tipos:** resumo compacto, detalhe sob demanda, elegibilidade privada fora de cache público, revalidação por modalidade/retomada/expiração, favoritos com preço coerente e ofertas de carrinho/frete com condições explícitas.
5. **Gestão completa:** edição de todos os tipos com tipo imutável, revisão antes de publicar, preview, imagem própria, status encerrado/indisponível, filtros, prevenção de ações duplicadas, validação de conflito também ao reativar e datas finais inclusivas na UI.
6. **Liberação:** testes financeiros e de concorrência, integração com cupons/fidelidade e operação, validação de zoom/teclado/leitor de tela, E2E no ambiente correto, build OpenNext compatível e rollout monitorado por loja.

Nenhuma conclusão de “pronto para produção” deve ser emitida antes de encerrar essas pendências.
