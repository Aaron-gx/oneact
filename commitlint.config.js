export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // OneAct 的 scope = 包名（去 @oneact/ 前缀）+ 基建项
    "scope-enum": [
      2,
      "always",
      [
        "core",
        "schema",
        "ai",
        "cli",
        "player",
        "components",
        "layouts",
        "exporter-deck",
        "exporter-pptx",
        "mcp",
        "desktop",
        "web",
        "deps",
        "docs",
        "ci",
      ],
    ],
    // subject 最长 72 字
    "subject-max-length": [2, "always", 72],
    // header 最长 100 字
    "header-max-length": [2, "always", 100],
  },
};
