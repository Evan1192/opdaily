import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sea navy base — lifted from near-black so the app reads warm, not grim.
        sea: {
          950: '#0a1124',
          900: '#121c3a',
          850: '#18244c',
          800: '#203060',
          700: '#2e4280',
          600: '#4a5e96',
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
          '0%, 100%': { boxShadow: '0 0 10px 2px rgba(52, 211, 153, 0.5)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 0 22px 7px rgba(52, 211, 153, 0.85)', transform: 'scale(1.03)' },
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
        confetti: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(110vh) rotate(540deg)', opacity: '0.3' },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 1.6s ease-in-out infinite',
        'card-enter': 'card-enter 0.35s ease-out both',
        'attack-shake': 'attack-shake 0.4s ease-in-out',
        'overlay-in': 'overlay-in 0.25s ease-out both',
        'poster-in': 'poster-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        confetti: 'confetti 3s linear both',
        'bounce-soft': 'bounce-soft 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
