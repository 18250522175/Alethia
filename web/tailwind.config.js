import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: theme('colors.slate.700'),
            a: {
              color: theme('colors.primary.600'),
              '&:hover': {
                color: theme('colors.primary.700'),
              },
            },
            'h1, h2, h3, h4, h5, h6': {
              color: theme('colors.slate.900'),
            },
            'blockquote': {
              borderLeftColor: theme('colors.primary.300'),
            },
          },
        },
        dark: {
          css: {
            color: theme('colors.slate.200'),
            a: {
              color: theme('colors.primary.400'),
              '&:hover': {
                color: theme('colors.primary.300'),
              },
            },
            'h1, h2, h3, h4, h5, h6': {
              color: theme('colors.slate.100'),
            },
            'blockquote': {
              color: theme('colors.slate.300'),
              borderLeftColor: theme('colors.primary.600'),
            },
            'code': {
              backgroundColor: theme('colors.slate.800'),
              color: theme('colors.slate.200'),
            },
            'pre': {
              backgroundColor: theme('colors.slate.800'),
            },
            'th, td': {
              borderColor: theme('colors.slate.700'),
            },
            'hr': {
              borderColor: theme('colors.slate.700'),
            },
          },
        },
      }),
      colors: {
        primary: {
          50: 'color-mix(in srgb, var(--accent-color, #6366f1) 10%, white)',
          100: 'color-mix(in srgb, var(--accent-color, #6366f1) 20%, white)',
          200: 'color-mix(in srgb, var(--accent-color, #6366f1) 30%, white)',
          300: 'color-mix(in srgb, var(--accent-color, #6366f1) 50%, white)',
          400: 'color-mix(in srgb, var(--accent-color, #6366f1) 70%, white)',
          500: 'var(--accent-color, #6366f1)',
          600: 'color-mix(in srgb, var(--accent-color, #6366f1) 90%, black)',
          700: 'color-mix(in srgb, var(--accent-color, #6366f1) 80%, black)',
          800: 'color-mix(in srgb, var(--accent-color, #6366f1) 60%, black)',
          900: 'color-mix(in srgb, var(--accent-color, #6366f1) 40%, black)'
        },
        knowledge: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d'
        },
        parchment: {
          50: '#fefdf8',
          100: '#fef9e7',
          200: '#fef0c3',
          300: '#fde68a',
          400: '#fcd34d',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f'
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: [typography]
};
