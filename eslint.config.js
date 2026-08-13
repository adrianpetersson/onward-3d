//  @ts-check

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // `.claude/worktrees/` holds full checkouts of sibling tickets, each with its own tsconfig.json.
  // Left visible, typescript-eslint finds several candidate roots and refuses to parse *any* file
  // in the repo — 57 parsing errors, including this config's own siblings.
  { ignores: ['dist', '.claude', 'src/map/style/*.json'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  reactHooks.configs.flat['recommended-latest'],
)
