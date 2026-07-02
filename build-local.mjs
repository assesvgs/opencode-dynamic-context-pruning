import esbuild from "esbuild"
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs"

const pkg = JSON.parse(readFileSync("package.json", "utf-8"))

if (!existsSync("dist")) mkdirSync("dist")

esbuild.buildSync({
    entryPoints: ["index.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: "dist/index.js",
    external: ["@opencode-ai/plugin", "@opencode-ai/sdk/*", "@opentui/*", "solid-js"],
    sourcemap: true,
})

const distPkg = {
    name: pkg.name,
    version: pkg.version,
    type: "module",
    description: pkg.description,
    main: "./index.js",
    exports: { ".": { types: "./index.d.ts", import: "./index.js" } },
    peerDependencies: pkg.peerDependencies,
}
writeFileSync("dist/package.json", JSON.stringify(distPkg, null, 2) + "\n")
copyFileSync("tui.tsx", "dist/tui.tsx")

console.log("✅ Built to dist/ (index.js + package.json + tui.tsx)")
