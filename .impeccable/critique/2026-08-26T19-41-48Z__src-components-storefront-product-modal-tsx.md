---
target: mobile fullscreen product detail
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-26T19-41-48Z
slug: src-components-storefront-product-modal-tsx
---
# Product detail mobile fullscreen — critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading, disabled, sold-out and error states are clear; required feedback remains generic. |
| 2 | Match System / Real World | 3 | Natural ordering vocabulary; “A partir de” may overstate configurability. |
| 3 | User Control and Freedom | 3 | Clear close/Esc, quantity editing, undo and focus return. |
| 4 | Consistency and Standards | 2 | Custom radio roles lack the complete expected keyboard model. |
| 5 | Error Prevention | 3 | Quantity and selection limits are enforced; required-group recovery is weak. |
| 6 | Recognition Rather Than Recall | 3 | Options and total remain visible, but product identity leaves the viewport on long forms. |
| 7 | Flexibility and Efficiency | 2 | Basic keyboard access exists; arrow-key radio navigation is absent. |
| 8 | Aesthetic and Minimalist Design | 3 | Focused composition; media can dominate short viewports. |
| 9 | Error Recovery | 3 | Inline retry preserves context and summary. |
| 10 | Help and Documentation | 2 | Min/max labels help, but a blocked CTA does not identify the incomplete group. |
| **Total** | | **27/40** | **Acceptable; targeted hardening remains.** |

## Design Specificity Verdict

The image-first, Portuguese food-commerce composition, white-label tokens and price treatment fit PedidoLocal, while the configuration flow remains intentionally familiar rather than highly branded. The deterministic detector returned zero findings for `src/components/storefront/product-modal.tsx`. Browser inspection was attempted independently but the storefront returned HTTP 500 because Prisma failed with `EACCES`, so there is no reliable live visual overlay for this run.

## Overall Impression

The instant first frame and fullscreen shell solve the original perceived-performance problem cleanly. The biggest remaining opportunity is to make long required-option flows easier to complete without weakening the compact, native-feeling surface.

## What's Working

1. Summary content and the cached card image appear independently from product-detail data, so only configuration uses a skeleton.
2. `100svh`/`100dvh`, one contained scroll area, persistent footer, safe-area offsets and a desktop breakpoint form a robust responsive shell.
3. Radix dialog semantics, explicit loading/error regions and hidden decorative skeleton geometry provide a solid accessibility base.

## Priority Issues

1. **[P1] Radio keyboard contract is incomplete.** `option-group-selector.tsx` uses `radiogroup`/`radio` roles on buttons without roving tabindex or Arrow/Home/End behavior. Fix with native radios or the complete ARIA keyboard model. Suggested command: `$impeccable audit`.
2. **[P1] Some white-label contrast paths are not guaranteed.** Filled favorite, price and focus treatments use primary directly even though arbitrary merchant palettes may not preserve contrast. Bind filled controls to validated foreground/background pairs and keep price emphasis readable. Suggested command: `$impeccable colorize`.
3. **[P1] Required-option recovery is generic.** The disabled CTA says something is missing without naming or focusing the first incomplete group. Add precise recovery without showing premature error styling. Suggested command: `$impeccable clarify`.
4. **[P2] Product identity disappears on long configuration forms.** Consider a compact sticky name/price state after the hero scrolls away. Suggested command: `$impeccable adapt`.
5. **[P2] Media can dominate short or landscape screens.** Add a short-height treatment after live viewport validation. Suggested command: `$impeccable optimize`.

## Persona Red Flags

- **Casey, distracted mobile user:** strong thumb-zone CTA and safe areas, but long forms do not lead directly to an incomplete required group.
- **Jordan, first-timer:** labels are clear, but the required message is generic and “A partir de” may imply choices that do not exist.
- **Sam, accessibility-dependent:** dialog semantics are strong; custom radio keyboard behavior and arbitrary-theme focus contrast still need hardening.

## Minor Observations

- Three-line description clamping should be reviewed if descriptions can contain ingredient or allergen-critical text.
- Optional single-choice groups need an explicit policy for clearing a selection.
- Multiple footer status messages can increase footer height on rare combined states.
- The semantic option skeleton is focused and appropriately hidden from assistive technology.

## Questions to Consider

1. After the first swipe, should compact name/price remain persistent?
2. Should the blocked CTA actively guide users to the first incomplete required group?
3. Are product descriptions ever safety-critical enough that clamping is unacceptable?
