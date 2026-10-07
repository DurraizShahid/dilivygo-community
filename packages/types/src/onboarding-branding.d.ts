export function isHexColor(value: unknown): value is string;
export function contrastRatio(a: string, b: string): number;
export function readableForeground(color: string): string;
export type BrandThemeTokens = Partial<Record<'primary' | 'primaryForeground' | 'accent' | 'accentForeground' | 'ring', string>>;
export function createBrandTheme(primary?: string | null, accent?: string | null): { light: BrandThemeTokens; dark: BrandThemeTokens };
export function extractPalette(pixels: ArrayLike<number>, limit?: number): string[];
