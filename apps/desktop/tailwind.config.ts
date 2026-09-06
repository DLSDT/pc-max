import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Vazirmatn reads well in both scripts, which matters here: the UI is
        // Persian with Latin product names, version numbers and file paths
        // running through it, and the default stack rendered those two halves
        // in visibly different typefaces.
        sans: ['Vazirmatn Variable', 'Vazirmatn', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Light falls from above, so a shadow sits below the thing casting it.
        // These replace a pair of coloured glows — `0 0 24px` of the brand
        // colour spreading evenly in every direction, which is a lit sign, not
        // an object on a surface. Two layers each: a hairline contact shadow
        // that seats the edge, and a wide soft one that lifts it.
        soft: '0 1px 2px hsl(20 15% 10% / 0.04), 0 2px 8px -4px hsl(20 15% 10% / 0.06)',
        lift: '0 1px 2px hsl(20 15% 10% / 0.05), 0 12px 28px -12px hsl(20 15% 10% / 0.14)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
