/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
  // SVGR under Turbopack (Next 16 default). Apply @svgr/webpack to `.svg`
  // imports so `import Logo from './x.svg'` → React component; the `not`/query
  // condition skips `?url` imports so `import url from './x.svg?url'` falls
  // through to Turbopack's default asset handling (yields the URL).
  turbopack: {
    rules: {
      "*.svg": {
        condition: { not: { query: /[?&]url(?=&|$)/ } },
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  // SVGR under webpack (only used with `next --webpack`): `import Logo from
  // './x.svg'` → React component; `import url from './x.svg?url'` → asset URL.
  // Official recipe — reroutes Next's file-loader off .svg.
  webpack(config) {
    const fileLoaderRule = config.module.rules.find(
      (rule) => rule.test?.test?.(".svg"),
    );
    config.module.rules.push(
      { ...fileLoaderRule, test: /\.svg$/i, resourceQuery: /url/ },
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /url/] },
        use: ["@svgr/webpack"],
      },
    );
    fileLoaderRule.exclude = /\.svg$/i;
    return config;
  },
};

module.exports = nextConfig;
