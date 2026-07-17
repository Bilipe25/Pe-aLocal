import type { StoreCustomizationConfig } from '@/schemas/customization';

export interface ContrastIssue {
  pair: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  severity: 'error' | 'warning';
  message: string;
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const value = hex.slice(1);
  const red = channelToLinear(Number.parseInt(value.slice(0, 2), 16));
  const green = channelToLinear(Number.parseInt(value.slice(2, 4), 16));
  const blue = channelToLinear(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function issue(
  pair: string,
  foreground: string,
  background: string,
  minimum: number,
  severity: ContrastIssue['severity'],
): ContrastIssue | null {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= minimum) return null;
  return {
    pair,
    foreground,
    background,
    ratio: Number(ratio.toFixed(2)),
    minimum,
    severity,
    message: `${pair}: contraste ${ratio.toFixed(2)}:1; mínimo ${minimum}:1.`,
  };
}

export function evaluateCustomizationContrast(config: StoreCustomizationConfig): ContrastIssue[] {
  const { palette } = config;
  return [
    issue('Texto sobre fundo', palette.text, palette.background, 4.5, 'error'),
    issue('Texto sobre cartão', palette.text, palette.surface, 4.5, 'error'),
    issue('Texto do botão', palette.buttonText, palette.buttonBackground, 4.5, 'error'),
    issue('Links sobre fundo', palette.primary, palette.background, 4.5, 'warning'),
    issue('Elemento selecionado', palette.primary, palette.surface, 3, 'warning'),
    issue('Texto secundário', palette.mutedText, palette.background, 4.5, 'warning'),
    issue('Borda sobre cartão', palette.border, palette.surface, 3, 'warning'),
  ].filter((value): value is ContrastIssue => value !== null);
}

export function hasCriticalContrastIssues(config: StoreCustomizationConfig): boolean {
  return evaluateCustomizationContrast(config).some((item) => item.severity === 'error');
}
