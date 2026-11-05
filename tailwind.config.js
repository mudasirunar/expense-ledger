/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0B0F19',
          light: '#F8FAFC',
        },
        surface: {
          DEFAULT: '#111827',
          light: '#FFFFFF',
          elevated: '#1F2937',
          'elevated-light': '#F1F5F9',
        },
        border: {
          DEFAULT: '#374151',
          light: '#E2E8F0',
        },
        financial: {
          inflow: '#10B981',
          outflow: '#F43F5E',
          warning: '#F59E0B',
          info: '#3B82F6',
        }
      },
      screens: {
        'mobile-sm': '360px',
        'mobile-md': '390px',
        'mobile-lg': '430px',
      }
    },
  },
  plugins: [],
}
