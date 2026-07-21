import { z } from 'zod';

// =============================================================================
// formBooleanSchema — Parsing seguro de booleanos vindos de FormData
// =============================================================================
// z.coerce.boolean() usa Boolean(value) internamente.
// Boolean("false") === true, porque "false" é uma string não-vazia.
// Este schema trata explicitamente todos os casos de FormData.
//
// Valores aceitos como true:
//   true (boolean), "true", "on" (checkbox HTML)
//
// Valores aceitos como false:
//   false (boolean), "false", "off", "", undefined, null
//
// =============================================================================

export const formBooleanSchema = z.preprocess((value) => {
  if (value === true || value === 'true' || value === 'on') return true;
  return false;
}, z.boolean());

/**
 * Booleano de formulário com valor padrão explícito.
 * Usar quando o campo pode estar ausente no FormData.
 */
export function formBooleanWithDefault(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return defaultValue;
    if (value === true || value === 'true' || value === 'on') return true;
    return false;
  }, z.boolean());
}
