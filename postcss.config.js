// PostCSS pipeline for the SPA.
//
// Wires the Tailwind v4 + autoprefixer plugins into Vite's build. Both deps
// are already declared in package.json (tailwindcss / @tailwindcss/postcss /
// autoprefixer); this config is what turns @import "tailwindcss" in
// src/index.css into the production CSS bundle.
//
// Until this file existed, the SPA had Tailwind installed but no pipeline
// wiring; every Tailwind utility class in src/ produced no output and the
// dist build emitted zero .css files. See the v0.5.0+1 commit message for
// the full diagnosis.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
