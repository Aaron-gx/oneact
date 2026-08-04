import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // 基础规则
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // 全局忽略
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "packages/*/bin/**",
      "packages/*/build.mjs",
      "vitest.config.ts",
      "eslint.config.js",
      "commitlint.config.js",
    ],
  },

  // TypeScript 源文件
  {
    files: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // ── OneAct 专属规则（硬性，不可违反）──

      // 禁止 any，必须显式 unknown 并收窄
      "@typescript-eslint/no-explicit-any": "error",

      // 未使用的变量（存量降为 warn，新代码应保持零 unused）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // 安全红线：禁止 eval / new Function（OneAct 做 HTML 拼接，绝不允许动态执行）
      "no-eval": "error",
      "no-new-func": "error",

      // import：禁止循环依赖 + 排序
      "import/no-cycle": ["error", { maxDepth: 10 }],
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],

      // 类型导入统一用 import type
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ── 存量代码过渡：以下规则先降为 warn，新代码应修，存量逐步还债 ──
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "no-useless-escape": "warn",
      "no-irregular-whitespace": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/consistent-indexed-object-style": "warn",
      "no-empty": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },

  // 测试文件放宽（用非类型检查规则集，无需 projectService）
  {
    files: ["**/test/**/*.test.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },

  // Prettier 兼容（关闭所有格式规则）
  prettierConfig,
);
