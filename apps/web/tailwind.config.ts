import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep-sea navy base. Darker than slate, slightly blue-shifted.
        sea: {
          950: '#060a14',
          900: '#0a1022',
          850: '#0e1630',
          800: '#141e3c',
          700: '#1d2a52',
          600: '#2a3a6b',
        },
        // Brass / gold chrome and DON!!.
        brass: {
          300: '#f0d48a',
          400: '#e3bb5f',
          500: '#c99b3f',
          600: '#a67c2e',
          700: '#7d5a20',
          900: '#3d2c10',
        },
        // Crimson action / danger accent.
        bounty: {
          400: '#f26d6d',
          500: '#dc3b3b',
          600: '#b42626',
          700: '#8a1a1a',
          900: '#450d0d',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      boxShadow: {
        'glow-target': '0 0 12px 2px rgba(52, 211, 153, 0.45)',
        'glow-selected': '0 0 14px 3px rgba(227, 187, 95, 0.55)',
        'glow-combat': '0 0 20px 4px rgba(220, 59, 59, 0.4)',
        mat: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 1px rgba(52, 211, 153, 0.35)' },
          '50%': { boxShadow: '0 0 16px 4px rgba(52, 211, 153, 0.6)' },
        },
        'card-enter': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'attack-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-3px)' },
          '40%': { transform: 'translateX(3px)' },
          '60%': { transform: 'translateX(-2px)' },
          '80%': { transform: 'translateX(2px)' },
        },
        'overlay-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'poster-in': {
          '0%': { opacity: '0', transform: 'scale(0.92) rotate(-1deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 1.6s ease-in-out infinite',
        'card-enter': 'card-enter 0.35s ease-out both',
        'attack-shake': 'attack-shake 0.4s ease-in-out',
        'overlay-in': 'overlay-in 0.25s ease-out both',
        'poster-in': 'poster-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
      },
    },
  },
  plugins: [],
};

export default config;
