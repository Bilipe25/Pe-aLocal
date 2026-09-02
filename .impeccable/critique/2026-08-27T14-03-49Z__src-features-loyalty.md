---
target: Fidelidade V1 — Volte e Ganhe
total_score: 32
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-27T14-03-49Z
slug: src-features-loyalty
---
# Design Health Score

| # | Heurística | Nota | Evidência |
|---|---|---:|---|
| 1 | Visibilidade do estado | 3 | Salvamento tem loading e confirmação; atualização assíncrona do progresso ainda não comunica latência. |
| 2 | Linguagem do mundo real | 4 | A copy evita jargão e explica pedido, benefício e mínimo diretamente. |
| 3 | Controle e liberdade | 3 | Ativação é reversível e há uma única ação de salvar; não há desfazer explícito. |
| 4 | Consistência | 3 | Tokens e componentes do produto são preservados; falta validação visual conectada. |
| 5 | Prevenção de erros | 3 | Limites, entitlement, identidade e regra recompensa ≤ mínimo são validados no servidor. |
| 6 | Reconhecimento, não memória | 4 | Regra, progresso, valor e condição de uso ficam juntos. |
| 7 | Flexibilidade e eficiência | 3 | A configuração cabe em menos de um minuto e mantém controles nativos. |
| 8 | Estética e minimalismo | 4 | Uma regra, um progresso, um benefício e quatro métricas; detector limpo. |
| 9 | Recuperação de erros | 2 | O erro é anunciado, mas ainda não aparece junto ao campo correspondente. |
| 10 | Ajuda e documentação | 3 | Preview e Como funciona resolvem dúvidas no contexto. |
| **Total** | | **32/40** | **Bom** |

# Design Specificity Verdict

A experiência está coerente com o balcão digital do bairro: simples, white-label e centrada na loja. Não parece fintech, ERP ou programa de milhas. O detector retornou zero achados em `src/features/loyalty`. A inspeção ao vivo foi tentada, mas as rotas da loja retornaram erro por indisponibilidade local do Prisma; não foi aplicada migration para contornar a restrição.

# Overall Impression

A proposta é compreendida em segundos. A maior oportunidade restante é tornar erros de configuração específicos por campo e validar a jornada conectada após a migration ser aplicada em ambiente descartável.

# What's Working

- Benefício conquistado aparece antes do próximo ciclo.
- Programa pausado não exibe progresso fictício; recompensas existentes permanecem claras.
- Toggle mais um único botão evita decisões concorrentes.
- Progresso até 20 pedidos quebra em no máximo dez colunas.
- Pedido mínimo zero usa copy natural.

# Priority Issues

- **[P2] Erros ainda aparecem como resumo.** Mapear `fieldErrors` para cada input. Suggested command: `$impeccable harden`.
- **[P2] Atualização assíncrona não tem sinal contextual.** Explicar que pedidos concluídos podem levar alguns instantes. Suggested command: `$impeccable clarify`.
- **[P2] Jornada visual conectada não foi comprovada.** Executar E2E em banco descartável com migration e entitlement piloto. Suggested command: `$impeccable audit`.
- **[P3] Celebração é estática.** Se desejado, adicionar transição curta com `prefers-reduced-motion`. Suggested command: `$impeccable delight`.

# Persona Red Flags

- **Jordan:** entende a promessa e não é forçado a entrar; o destino de Confirmar meu acesso ainda precisa de teste conectado.
- **Casey:** CTAs e campos têm 44 px e o benefício vem primeiro; a latência do outbox pode parecer atraso.
- **Sam:** progresso tem nome textual e controles nativos; erros por campo melhorariam a recuperação.

# Minor Observations

- Quatro métricas é o limite certo para a V1.
- A microcelebração deve continuar sem confete, som ou vibração.
- Nenhuma linguagem técnica vazou para a interface.

# Questions to Consider

Questions skipped: o usuário já solicitou todos os refinamentos e os achados confirmados foram aplicados diretamente.
