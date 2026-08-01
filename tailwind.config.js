/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B1220',
        panel: '#121B2E',
        line: '#223049',
        accent: '#ED1B2F',
        amber: '#F2A93B',
        cyan: '#4FB6C4',
        ink: '#EAF0F6',
        muted: '#7C8BA1'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      backgroundImage: {
        grid: 'linear-gradient(#223049 1px, transparent 1px), linear-gradient(90deg, #223049 1px, transparent 1px)'
      },
      backgroundSize: {
        grid: '24px 24px'
      }
    }
  },
  plugins: []
}
