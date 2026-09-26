/* eslint-disable @typescript-eslint/no-var-requires */
const withMDX = require("@next/mdx")();
const pkg = require("./package.json");
const { parseEmbedOrigin } = require("./src/lib/embed-origin");
const embedOrigin = parseEmbedOrigin(
  process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  env: {
    NEXT_PUBLIC_STUDIO_VERSION: pkg.version,
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedOrigin ?? "'none'"}`,
          },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_OB_API ?? "https://app.dev.outerbase.com/api/v1"}/:path*`,
      },
    ];
  },
};

module.exports = { ...withMDX(nextConfig), output: "standalone" };
