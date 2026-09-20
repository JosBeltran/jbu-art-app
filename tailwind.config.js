/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#fdfbf7',       // Fondo principal claro / marfil editorial
          card: '#ffffff',     // Fondo de contenedores / modales / tarjetas
          subtle: '#f4f3ef',   // Secciones secundarias o hover ligero
          border: '#e5e5e0',   // Bordes sutiles claros
          text: '#171717',     // Texto principal oscuro
          muted: '#737373',    // Texto secundario / leyendas
          
          // Elementos oscuros / acentos de alto contraste
          dark: '#0a0a0a',     // Negro profundo (Exclusivo para botones y acentos)
          'dark-hover': '#262626',
          gold: '#d97706',     // Ámbar/Dorado para XP, badges e insignias JBU
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}