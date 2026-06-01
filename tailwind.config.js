/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: ['class', '[data-theme="midnight"], [data-theme="forest"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-soft': 'var(--primary-soft)',
        border: 'var(--border)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        soft: '0 1px 2px var(--shadow), 0 4px 12px var(--shadow)',
      },
    },
  },
  plugins: [],
};
