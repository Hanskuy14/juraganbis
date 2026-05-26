/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#070b1a',
          800: '#0d132a',
          700: '#141b3a',
        },
        accent: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        emerald: {
          glow: '#34d399',
        },
      },
      backgroundImage: {
        'aurora':
          'radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.25), transparent 60%), radial-gradient(900px 600px at 110% 10%, rgba(245,158,11,0.20), transparent 60%), radial-gradient(800px 500px at 50% 120%, rgba(16,185,129,0.18), transparent 60%)',
      },
      boxShadow: {
        glass:
          '0 1px 0 rgba(255,255,255,0.06) inset, 0 10px 30px rgba(0,0,0,0.35)',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
