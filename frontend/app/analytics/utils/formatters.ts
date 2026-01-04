/**
 * Format number as percentage (Indonesian locale)
 */
export const pct = (n: number) =>
    (n / 100).toLocaleString('id-ID', { style: 'percent', minimumFractionDigits: 2 });

/**
 * Format number as integer with thousand separators (Indonesian locale)
 */
export const int = (n: number) => (n ?? 0).toLocaleString('id-ID');

/**
 * Sum an array of numbers
 */
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
