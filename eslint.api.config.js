// ============================================================================
// ONE JOB, FOR THE API: a name that does not exist fails the check
// ============================================================================
// tsx and esbuild strip types and never ask whether a name was declared, so an
// undeclared variable ships and breaks only when that line runs (GET
// /share-links/mine answered 500 for everyone with a link). This is the
// backend's twin of eslint.config.js: `no-undef` and nothing else.
// Run: npm run check:api
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    files: ['backend/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      // NodeJS is a namespace of types @types/node declares globally
      // (NodeJS.Timeout); no-undef cannot see type declarations.
      globals: { ...globals.node, NodeJS: 'readonly' },
    },
    rules: { 'no-undef': 'error' },
  },
]
