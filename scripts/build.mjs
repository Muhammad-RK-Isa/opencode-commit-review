import { build } from "esbuild"
import { transformAsync } from "@babel/core"
import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"

await build({
  entryPoints: ["src/index.ts", "src/tui.tsx", "src/rpc.ts"], outdir: "dist", bundle: true,
  format: "esm", platform: "node", target: "es2023", packages: "external", sourcemap: true,
  plugins: [{ name: "opentui-solid", setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8")
      // Strip TS before the Solid universal renderer transform; never bundle a host runtime.
      const { transform } = await import("esbuild")
      const js = await transform(source, { loader: "tsx", jsx: "preserve" })
      const result = await transformAsync(js.code, { filename: path, presets: [["babel-preset-solid", { moduleName: "@opentui/solid", generate: "universal" }]], babelrc: false, configFile: false })
      return { contents: result.code, loader: "js" }
    })
  } }],
})
const declarations = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"], { stdio: "inherit" })
if (declarations.status !== 0) process.exit(declarations.status ?? 1)
