import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers ships its own WASM and ONNX runtime; bundling it
  // breaks the loader. Keep it external in server contexts.
  serverExternalPackages: ["@xenova/transformers"],
};

export default nextConfig;
