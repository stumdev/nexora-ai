/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        line: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        lime: 'rgb(var(--lime) / <alpha-value>)',
        'lime-text': 'rgb(var(--lime-text) / <alpha-value>)',
        'on-lime': 'rgb(var(--on-lime) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      keyframes: {
        fadein: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        pulse2: { '0%,100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
      },
      animation: { fadein: 'fadein 180ms ease-out', pulse2: 'pulse2 1.2s ease-in-out infinite' },
    },
  },
  plugins: [],
};
