/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors for heatmap
        heatmap: {
          cold: '#3B82F6',    // blue-500
          warm: '#EF4444',    // red-500
          hot: '#DC2626',     // red-600
        },
        // Brand colors
        brand: {
          primary: '#1E40AF', // blue-800
          secondary: '#64748B', // slate-500
        }
      },
      animation: {
        'marker-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'tooltip-fade': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
}
