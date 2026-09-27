// ============================================================================
// ONE JOB: a name that does not exist fails the build (9.3)
// ============================================================================
// `vite build` compiles JSX but never asks whether a name used in it was
// defined or imported, so a missing import shipped and broke only when someone
// reached that code (the Copy button, Part 0 of the Mahalaxmi plan). This
// checks exactly that and nothing else: no style rules, nothing that argues
// about how code is written. `npm run build` runs it before Vite.
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'backend/**', 'public/**', 'docs/**'] },
  {
    // The code's "disable the hooks rule here" comments are fine as they are.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    files: ['src/**/*.{js,jsx}', 'scripts/**/*.mjs'],
    // react-hooks is loaded only because the code switches its rule off in
    // comments; the rule itself stays off.
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // A plain name used but never defined or imported.
      'no-undef': 'error',
      // The same, for a component: <Foo /> with no Foo in scope.
      'react/jsx-no-undef': 'error',
      // Needed so a name used only in JSX does not look unused to the rule above.
      'react/jsx-uses-vars': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]
