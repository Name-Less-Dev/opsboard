// @ts-check
// Config única de ESLint (flat config) para o monorepo inteiro.
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      // Gerado por npm run types:generate.
      'apps/web/src/lib/api-types.ts',
    ],
  },

  eslint.configs.recommended,
  // "TypeChecked": regras que usam os tipos do TS (ex.: promise sem await, any vazando).
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Cada arquivo usa o tsconfig.json mais próximo (api ou web).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Permite ignorar variáveis com prefixo _ (ex.: parâmetros obrigatórios não usados).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Arquivos JS de configuração não fazem parte de nenhum tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // API (NestJS) e scripts do Prisma: Node + Jest.
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  {
    // Matchers do Jest (expect.any etc.) retornam any por definição.
    files: ['apps/api/**/*.spec.ts', 'apps/api/test/**/*.ts'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },

  // Web (React): regras de hooks e de Fast Refresh do Vite.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Testes e2e (Playwright): rodam no Node. O `use` das fixtures não é o hook do React.
  {
    files: ['apps/web/e2e/**/*.ts', 'apps/web/playwright*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'react-hooks/rules-of-hooks': 'off', 'react-refresh/only-export-components': 'off' },
  },

  // Sempre por último: desliga regras de estilo que o Prettier já cuida.
  prettier,
);
