export type RgbColor = [number, number, number];

export function parseRgbTriplet(value: string): RgbColor {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
    throw new Error(`Expected RGB triplet, got "${value}"`);
  }
  return [parts[0], parts[1], parts[2]];
}

export function parseHex(value: string): RgbColor {
  const hex = value.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected hex color, got "${value}"`);
  }
  return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as RgbColor;
}

export function parseColor(value: string): RgbColor {
  return value.trim().startsWith('#') ? parseHex(value) : parseRgbTriplet(value);
}

export function luminance(color: RgbColor): number {
  const [r, g, b] = color.map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: RgbColor, second: RgbColor): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function composite(foreground: RgbColor, alpha: number, background: RgbColor): RgbColor {
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + background[index] * (1 - alpha))
  ) as RgbColor;
}

export function varValue(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[1].trim();
}

export function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`[^{}]*${escaped}[^{}]*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing block for ${selector}`);
  return match[1];
}

export function discoverAccentNames(css: string): string[] {
  const names = new Set<string>();
  for (const match of css.matchAll(/html\[data-accent=['"]([^'"]+)['"]\]/g)) {
    names.add(match[1]);
  }
  return [...names];
}

export function resolveColorValue(name: string, ...cssContexts: string[]): RgbColor {
  let currentName = name;
  const visited = new Set<string>();

  while (!visited.has(currentName)) {
    visited.add(currentName);
    let value: string | undefined;
    for (const css of cssContexts) {
      try {
        value = varValue(css, currentName);
        break;
      } catch {
        // Continue through the cascade contexts until the token is found.
      }
    }
    if (!value) throw new Error(`Missing ${currentName} in CSS contexts`);

    const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (!reference) return parseColor(value);
    currentName = reference[1];
  }

  throw new Error(`Circular CSS variable reference for ${name}`);
}
