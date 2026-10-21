import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        casino: {
          table: '#0f2b1d',
          felt: '#133b26',
          border: '#081710',
        },
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0px 0px rgba(255,255,255,0.0), 0 4px 12px rgba(0,0,0,0.4)' },
          '50%': { boxShadow: '0 0 24px 6px rgba(255,255,255,0.55), 0 4px 16px rgba(0,0,0,0.5)' },
        },
        'turn-ring': {
          '0%, 100%': { boxShadow: '0 0 0px 0px rgba(16,185,129,0.0)' },
          '50%': { boxShadow: '0 0 0px 6px rgba(16,185,129,0.45)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'confetti-fall': {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: '0.2' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 1.8s ease-in-out infinite',
        'turn-ring': 'turn-ring 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 6s linear infinite',
        'confetti-fall': 'confetti-fall linear forwards',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;