# Payload do catálogo público

## Linha de base da Fase 2

A medição foi feita após `next build`, usando o manifesto de referências de
cliente de `app/[storeSlug]/page` e os arquivos gerados em
`.next/static/chunks`.

| Recurso inicial da rota             |     Bruto |     Gzip |
| ----------------------------------- | --------: | -------: |
| JavaScript referenciado pela página | 183,8 KiB | 54,3 KiB |
| CSS referenciado pela página        |  83,8 KiB | 14,5 KiB |
| Total                               | 267,5 KiB | 68,8 KiB |

A auditoria anterior à Fase 2 encontrou aproximadamente 272 KiB brutos para
os recursos iniciais equivalentes. A diferença é pequena e não comprova ganho
arquitetural; hashes, minificação e composição dos chunks podem variar entre
builds.

O HTML/RSC também serializa categorias, produtos e grupos de opções. Portanto,
o custo desse contrato cresce com o tamanho do cardápio e precisa ser medido
com catálogos pequenos, médios e grandes antes de mudar o limite entre Server e
Client Components.

## Decisão

Não dividir `CatalogView` nesta fase. Busca, seleção de categoria, modal,
customizações e carrinho formam hoje uma fronteira interativa coesa. Separá-la
sem um benchmark representativo adicionaria duplicação de DTOs, risco de
hidratação e mais viagens de rede sem evidência suficiente de benefício.

As otimizações de baixo risco aplicadas agora são:

- busca com `useDeferredValue`, preservando resposta imediata do campo;
- imagens responsivas com `srcset`, `sizes`, carregamento lazy e fallback;
- redução da imagem padrão de produto de 768 px para 384 px nas listagens.

## Proposta para um PR separado

1. Criar fixtures de catálogo pequeno, médio e grande e registrar HTML/RSC,
   JavaScript hidratado, LCP e INP em viewport mobile.
2. Extrair um DTO público estável, sem transportar campos administrativos.
3. Renderizar no servidor cabeçalho e cascas estáticas das categorias.
4. Manter ilhas de cliente apenas para busca, modal e carrinho.
5. Avaliar carregamento sob demanda dos grupos de opções somente se a redução
   do payload superar o custo da requisição adicional.
6. Aceitar a mudança apenas com melhora reproduzível e sem regressão nos fluxos
   de personalização, pedido e acessibilidade.
