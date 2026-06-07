import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cake: {
          50:  '#fdf8f0',
          100: '#faefd9',
          200: '#f5dba8',
          300: '#efc071',
          400: '#e8a03e',
          500: '#d4821e',
          600: '#b96516',
          700: '#964c14',
          800: '#793d16',
          900: '#633315',
        },
      },
    },
  },
  plugins: [],
};

export default config;
