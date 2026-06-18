/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx,css}'],
  theme: {
    extend: {
      fontFamily: {
        // Source Sans 3 = cuerpo/datos (default `sans`); Lexend = títulos/etiquetas
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        heading: ['Lexend', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // ── Neutro teñido de teal (reemplaza el slate gris-azulado) ───────
        // Misma luminosidad que el slate original (preserva contraste WCAG),
        // pero matiz teal (195°) y croma bajo → cohesión con la marca AED,
        // sin grises planos. Toda la app usa slate-*, así que esto re-tiñe
        // texto, bordes y fondos del sistema completo de una sola vez.
        slate: {
          50:  'oklch(0.984 0.005 195 / <alpha-value>)',
          100: 'oklch(0.968 0.008 195 / <alpha-value>)',
          200: 'oklch(0.929 0.012 195 / <alpha-value>)',
          300: 'oklch(0.869 0.016 195 / <alpha-value>)',
          400: 'oklch(0.711 0.020 195 / <alpha-value>)',
          500: 'oklch(0.554 0.022 195 / <alpha-value>)',
          600: 'oklch(0.446 0.022 195 / <alpha-value>)',
          700: 'oklch(0.372 0.020 195 / <alpha-value>)',
          800: 'oklch(0.279 0.018 195 / <alpha-value>)',
          900: 'oklch(0.208 0.016 195 / <alpha-value>)',
          950: 'oklch(0.129 0.012 195 / <alpha-value>)',
        },
        // ── Marca (teal AED) ──────────────────────────────────────────────
        brand: {
          DEFAULT: 'var(--brand)',
          strong: 'var(--brand-strong)',
          soft: 'var(--brand-soft)',
          tint: 'var(--brand-tint)',
        },
        // ── Neutros (navy-tinted) ─────────────────────────────────────────
        ink: 'var(--ink)',
        // superficies / bordes expuestos como tokens
        surface: 'var(--surface)',
        'surface-base': 'var(--surface-base)',
        'aed-base': 'var(--surface-base)', // alias legado
        'aed-border': 'var(--border)',
        'border-soft': 'var(--border-soft)',
        // ── Estados del dominio ───────────────────────────────────────────
        success: {
          DEFAULT: 'var(--success-text)',
          text: 'var(--success-text)',
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
        },
        danger: {
          DEFAULT: 'var(--danger-text)',
          text: 'var(--danger-text)',
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
        },
        warning: {
          DEFAULT: 'var(--warning-text)',
          text: 'var(--warning-text)',
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
        },
        info: {
          DEFAULT: 'var(--info-text)',
          text: 'var(--info-text)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },
      },
    },
  },
  plugins: [],
};
