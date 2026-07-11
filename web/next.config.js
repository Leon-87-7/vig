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
  // SVGR under Turbopack (Next 16 default): `import Logo from './x.svg'`
  // yields a React component.
  turbopack: {
    root: __dirname,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  // SVGR under webpack (only used with `next --webpack`): reroute Next's
  // default file loader off .svg, then process SVGs as React components.
  webpack(config) {
    const fileLoaderRule = config.module.rules.find(
      (rule) => rule.test?.test?.(".svg"),
    );
    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/i;
      config.module.rules.push({
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        use: ["@svgr/webpack"],
      });
    }
    return config;
  },
};

module.exports = nextConfig;
