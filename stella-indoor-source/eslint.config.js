import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // These experimental react-hooks rules flag common, intentional React patterns
      // (e.g. initializing state in an effect, Date.now/Math.random in render).
      // Disabling them keeps the lint suite useful without forcing a large refactor.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      // The project exports hooks/helpers alongside components (shadcn/ui pattern),
      // so fast-refresh component-only export checks are not useful here.
      'react-refresh/only-export-components': 'off',
    },
  },
])
