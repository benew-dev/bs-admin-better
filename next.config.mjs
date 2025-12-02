import { withSentryConfig } from "@sentry/nextjs";

// ===== VALIDATION DES VARIABLES D'ENVIRONNEMENT =====
const validateEnv = () => {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const IS_VERCEL = process.env.VERCEL === "1";

  console.log(`🔍 Admin Environment:
    - NODE_ENV: ${NODE_ENV}
    - IS_VERCEL: ${IS_VERCEL}
  `);

  // Variables critiques pour l'admin
  const REQUIRED_VARS = [
    "DB_URI",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
    "NEXT_PUBLIC_CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];

  // Variables optionnelles (Sentry)
  const OPTIONAL_VARS = [
    "SENTRY_DSN",
    "SENTRY_PROJECT",
    "SENTRY_AUTH_TOKEN",
    "SENTRY_ORG",
  ];

  // Vérification en production uniquement
  if (NODE_ENV === "production") {
    const missingVars = REQUIRED_VARS.filter(
      (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
      console.error(
        `❌ Missing critical environment variables: ${missingVars.join(", ")}`
      );
      // Ne pas faire échouer le build sur Vercel
      if (!IS_VERCEL) {
        throw new Error(
          `Missing critical environment variables: ${missingVars.join(", ")}`
        );
      }
    } else {
      console.log("✅ All required environment variables are present");
    }

    // Vérifier les variables optionnelles
    const missingOptional = OPTIONAL_VARS.filter(
      (varName) => !process.env[varName]
    );
    if (missingOptional.length > 0) {
      console.warn(
        `⚠️ Missing optional variables (Sentry may not work): ${missingOptional.join(", ")}`
      );
    }
  }
};

// Exécuter la validation
validateEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuration de base
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,

  // Configuration des images Cloudinary
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Configuration du compilateur
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn", "log"] }
        : false,
  },

  // Optimisations Vercel
  experimental: {
    optimizePackageImports: ["lucide-react", "react-toastify"],
  },

  // Headers de sécurité stricts pour admin
  async headers() {
    return [
      // Headers globaux de sécurité
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY", // Admin ne doit jamais être dans une iframe
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // CSP CORRIGÉE pour Cloudinary Upload Widget
          {
            key: "Content-Security-Policy",
            value: `
              default-src 'self' blob:;
              script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://upload-widget.cloudinary.com https://widget.cloudinary.com https://res.cloudinary.com https://cdnjs.cloudflare.com;
              style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;
              img-src 'self' blob: data: https://res.cloudinary.com https://*.cloudinary.com;
              font-src 'self' data: https://cdnjs.cloudflare.com;
              connect-src 'self' blob: https://res.cloudinary.com https://api.cloudinary.com https://upload-widget.cloudinary.com https://widget.cloudinary.com ${process.env.NODE_ENV === "production" ? "https://*.sentry.io" : ""};
              frame-src 'self' https://upload-widget.cloudinary.com https://widget.cloudinary.com;
              worker-src 'self' blob:;
              frame-ancestors 'none';
              base-uri 'self';
              form-action 'self';
            `
              .replace(/\s{2,}/g, " ")
              .trim(),
          },
        ],
      },

      // APIs admin - jamais de cache
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },

      // Auth endpoints - sécurité maximale
      {
        source: "/api/auth/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet",
          },
        ],
      },

      // Upload endpoints
      {
        source: "/api/products/upload_images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store",
          },
          {
            key: "X-Upload-Limit",
            value: "10MB",
          },
        ],
      },

      // Assets statiques
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },

      // Images locales
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=7200",
          },
        ],
      },

      // Admin pages - toujours privées
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },

  // Redirections
  async redirects() {
    return [
      {
        source: "/home",
        destination: "/",
        permanent: true,
      },
    ];
  },

  // Configuration Webpack minimale
  webpack: (config, { isServer }) => {
    // Optimisations basiques pour Vercel
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },

  // Ne pas bloquer le build sur les erreurs ESLint
  eslint: {
    ignoreDuringBuilds: true,
  },

  // TypeScript (si utilisé)
  typescript: {
    ignoreBuildErrors: true,
  },
};

// Configuration Sentry minimale pour admin
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG || "benew",
  project: process.env.SENTRY_PROJECT || "buyitnow",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Configuration silencieuse
  silent: true,
  dryRun: !process.env.SENTRY_AUTH_TOKEN,

  // Désactiver si pas de token
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,

  // Source maps
  hideSourceMaps: true,
  widenClientFileUpload: false,

  // Ignorer les erreurs
  errorHandler: (err) => {
    console.warn("Sentry webpack plugin error:", err.message);
  },
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
