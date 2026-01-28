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
        'primary': '#2A5AA5',
        'secondary': '#C14637',
        'accent': '#E8C374',
        'accent-strong': '#D2A04B',
        'background': '#111A2A',
        'surface': '#1E2A3E',
        'surface-light': '#293750',
        'surface-strong': '#344665',
        'ink': '#0B1119',
        'sand': '#F6EFE3',
        'muted': '#C4D0E3',
        'muted-dark': '#A8B6CC',
        'border': '#3D5576',
      },
      textColor: {
        sand: '#F6EFE3',
        muted: '#C4D0E3',
        'muted-dark': '#A8B6CC',
        ink: '#0B1119',
      },
      backgroundColor: {
        background: '#111A2A',
        surface: '#1E2A3E',
        'surface-light': '#293750',
        'surface-strong': '#344665',
        primary: '#2A5AA5',
        secondary: '#C14637',
        accent: '#E8C374',
        'accent-strong': '#D2A04B',
      },
      borderColor: {
        border: '#3D5576',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
