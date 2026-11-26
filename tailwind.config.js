/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
const names = ['bg', 'surface', 'surface-2', 'surface-3', 'border', 'line', 'text', 'text-2', 'text-3', 'map-label', 'primary', 'primary-strong', 'primary-soft', 'primary-soft-2', 'on-primary', 'safe', 'safe-line', 'safe-soft', 'caution', 'caution-line', 'caution-soft', 'danger', 'danger-text', 'danger-soft', 'star-empty', 'route-fast', 'route-safe'];
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...Object.fromEntries(names.map((n) => [n, v(`color-${n}`)])), muted: v('color-text-muted') },
      borderRadius: { card: 'var(--radius-card)', 'route-card': 'var(--radius-route-card)', sheet: 'var(--radius-sheet)', pill: '999px' },
      fontFamily: { sans: ['var(--font-sans)'] },
      boxShadow: { float: '0 4px 18px rgb(25 31 40 / 0.10)', sheet: '0 -6px 24px rgb(25 31 40 / 0.08)' },
    },
  },
  plugins: [],
};
