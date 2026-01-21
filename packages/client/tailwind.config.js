/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // One Piece TCG colors
        'op-red': '#DC2626',
        'op-green': '#16A34A',
        'op-blue': '#2563EB',
        'op-purple': '#9333EA',
        'op-black': '#1F2937',
        'op-yellow': '#EAB308',
        // UI colors
        'primary': '#1E40AF',
        'secondary': '#7C3AED',
        'accent': '#F59E0B',
        'background': '#0F172A',
        'surface': '#1E293B',
        'surface-light': '#334155',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Bebas Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
