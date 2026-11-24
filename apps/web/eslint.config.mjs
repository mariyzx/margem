import baseConfig from "@margem/config/eslint";

export default [
  ...baseConfig,
  {
    ignores: ["next-env.d.ts"],
  },
];
