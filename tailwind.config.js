/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'cyber-blue': '#00d4ff',
        'cyber-purple': '#7c3aed',
        'cyber-green': '#00ff88',
        'cyber-red': '#ff4444',
        'cyber-yellow': '#ffcc00',
        'dark-900': '#050810',
        'dark-800': '#0a0f1e',
        'dark-700': '#0f1629',
        'dark-600': '#141c33',
        'dark-500': '#1a2240',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'cyber': '0 0 20px rgba(0, 212, 255, 0.3), 0 0 40px rgba(0, 212, 255, 0.1)',
        'cyber-strong': '0 0 30px rgba(0, 212, 255, 0.5), 0 0 60px rgba(0, 212, 255, 0.2)',
        'cyber-red': '0 0 20px rgba(255, 68, 68, 0.3), 0 0 40px rgba(255, 68, 68, 0.1)',
        'cyber-green': '0 0 20px rgba(0, 255, 136, 0.3), 0 0 40px rgba(0, 255, 136, 0.1)',
      },
    },
  },
  plugins: [],
}
