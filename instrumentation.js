// instrumentation.js
// Configuration Sentry unifiée ultra-légère pour Admin (3 users/jour)
// Compatible Vercel gratuit - Erreurs critiques uniquement

import * as Sentry from "@sentry/nextjs";

// Configuration d'environnement
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_SERVER = typeof window === "undefined";
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

/**
 * Hook Next.js 15 - Initialisation de l'instrumentation
 * Configuration Sentry unifiée (client + serveur)
 */
export async function register() {
  // Validation du DSN
  if (!SENTRY_DSN || !SENTRY_DSN.startsWith("https://")) {
    console.warn("⚠️ Sentry: Invalid or missing DSN - monitoring disabled");
    return;
  }

  // Configuration commune client/serveur
  const commonConfig = {
    dsn: SENTRY_DSN,
    environment: IS_PRODUCTION ? "production" : "development",
    enabled: IS_PRODUCTION,

    // Sample rates très bas pour admin (3 users/jour)
    tracesSampleRate: 0, // Pas de performance monitoring
    replaysSessionSampleRate: 0, // Pas de session replay
    replaysOnErrorSampleRate: 0, // Pas de replay même sur erreur

    // Capture 10% des erreurs seulement en production
    sampleRate: IS_PRODUCTION ? 0.1 : 1.0,

    // Configuration de base
    debug: false,
    normalizeDepth: 3,
    maxBreadcrumbs: 20,
    attachStacktrace: true,
    autoSessionTracking: false, // Pas de tracking de session

    // Tags globaux
    initialScope: {
      tags: {
        project: "buyitnow-admin",
        runtime: IS_SERVER ? "nodejs" : "browser",
      },
    },

    // Filtrage des données sensibles
    beforeSend(event, hint) {
      // Ignorer en développement
      if (!IS_PRODUCTION) return null;

      // Filtrer les erreurs non critiques
      const error = hint?.originalException;
      const errorMessage = error?.message || event.message || "";

      // Liste des erreurs à ignorer
      const ignoredErrors = [
        "ResizeObserver",
        "Non-Error promise rejection",
        "Network request failed",
        "Load failed",
        "ChunkLoadError",
        "NEXT_REDIRECT",
        "NEXT_NOT_FOUND",
        "AbortError",
        "Hydration",
      ];

      if (ignoredErrors.some((ignored) => errorMessage.includes(ignored))) {
        return null;
      }

      // Anonymiser les données utilisateur
      if (event.user) {
        event.user = {
          id: event.user.id,
          // Pas d'email ni d'IP
        };
      }

      // Filtrer les URLs sensibles
      if (event.request?.url) {
        const url = event.request.url;
        if (
          url.includes("/api/auth") ||
          url.includes("token") ||
          url.includes("password")
        ) {
          event.request.url = "[FILTERED]";
        }
      }

      // Nettoyer les headers sensibles
      if (event.request?.headers) {
        const sensitiveHeaders = ["cookie", "authorization", "x-auth-token"];
        sensitiveHeaders.forEach((header) => {
          if (event.request.headers[header]) {
            event.request.headers[header] = "[FILTERED]";
          }
        });
      }

      // Nettoyer les breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter((breadcrumb) => {
          // Ignorer les breadcrumbs de navigation
          if (breadcrumb.category === "navigation") return false;

          // Ignorer les console.log
          if (breadcrumb.category === "console" && breadcrumb.level === "log")
            return false;

          // Filtrer les données sensibles dans les breadcrumbs
          if (breadcrumb.data?.url) {
            if (
              breadcrumb.data.url.includes("/api/auth") ||
              breadcrumb.data.url.includes("password")
            ) {
              breadcrumb.data.url = "[FILTERED]";
            }
          }

          return true;
        });
      }

      // Limiter les contextes
      if (event.contexts) {
        delete event.contexts.os;
        delete event.contexts.device;
        if (event.contexts.browser) {
          event.contexts.browser = {
            name: event.contexts.browser.name,
            version: event.contexts.browser.version,
          };
        }
      }

      // Catégoriser l'erreur pour l'admin
      event.tags = {
        ...event.tags,
        error_category: categorizeAdminError(error, errorMessage),
      };

      return event;
    },

    // Intégrations minimales
    integrations: function (integrations) {
      // Filtrer les intégrations pour garder seulement l'essentiel
      return integrations.filter((integration) => {
        const name = integration.name;

        // Garder seulement les intégrations critiques
        const essentialIntegrations = [
          "InboundFilters",
          "FunctionToString",
          "LinkedErrors",
          "Dedupe",
          "HttpContext",
          "ExtraErrorData",
        ];

        return essentialIntegrations.includes(name);
      });
    },
  };

  // Configuration spécifique serveur
  if (IS_SERVER) {
    Sentry.init({
      ...commonConfig,

      // Configurations serveur spécifiques
      serverName: "buyitnow-admin-server",

      // Ignorer certains modules
      ignoreTransactions: ["/_next/", "/api/health", "/api/auth/session"],

      // Traitement des transactions serveur
      beforeTransaction(transaction) {
        // Ignorer les transactions non critiques
        if (
          transaction.name?.includes("_next") ||
          transaction.name?.includes("static")
        ) {
          return null;
        }
        return transaction;
      },
    });

    console.log("✅ Sentry server initialized (admin mode)");
  } else {
    // Configuration spécifique client
    Sentry.init({
      ...commonConfig,

      // Options client spécifiques
      transportOptions: {
        // Limiter les tentatives de renvoi
        maxRetries: 2,
      },

      // Ignorer les erreurs de certains domaines
      denyUrls: [
        // Extensions de navigateur
        /extensions\//i,
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        /^moz-extension:\/\//i,

        // Services tiers
        /googletagmanager\.com/,
        /google-analytics\.com/,
        /facebook\.com/,
        /twitter\.com/,
      ],
    });

    console.log("✅ Sentry client initialized (admin mode)");
  }
}

/**
 * Hook Next.js 15 - Capture des erreurs de requête serveur
 */
export async function onRequestError(error, request) {
  // Capturer seulement en production
  if (!IS_PRODUCTION) {
    console.error("[Dev Error]:", error);
    return;
  }

  try {
    // Capturer seulement les erreurs critiques
    const isCritical = isAdminCriticalError(error, request);

    if (isCritical) {
      Sentry.withScope((scope) => {
        // Contexte de la requête
        scope.setContext("request", {
          url: request.url,
          method: request.method,
          // Pas de headers sensibles
        });

        // Tags pour catégorisation
        scope.setTag("error_source", "admin_request");
        scope.setTag("critical", true);

        // Niveau d'erreur
        scope.setLevel("error");

        // Capturer l'erreur
        Sentry.captureException(error, {
          tags: {
            component: "admin_server_request",
          },
        });
      });
    }
  } catch (sentryError) {
    // Silencieux en cas d'échec Sentry
    console.error("Sentry capture failed:", sentryError.message);
  }
}

/**
 * Catégoriser les erreurs pour l'admin
 */
function categorizeAdminError(error, message = "") {
  const errorString = `${error?.name || ""} ${message}`.toLowerCase();

  if (errorString.includes("auth") || errorString.includes("unauthorized")) {
    return "authentication";
  }
  if (errorString.includes("mongo") || errorString.includes("database")) {
    return "database";
  }
  if (errorString.includes("cloudinary") || errorString.includes("upload")) {
    return "media_upload";
  }
  if (errorString.includes("payment") || errorString.includes("order")) {
    return "business_logic";
  }
  if (errorString.includes("network") || errorString.includes("fetch")) {
    return "network";
  }

  return "application";
}

/**
 * Déterminer si une erreur est critique pour l'admin
 */
function isAdminCriticalError(error, request) {
  // Toujours capturer les erreurs de base de données
  if (error.message?.includes("mongo") || error.message?.includes("database")) {
    return true;
  }

  // Erreurs d'authentification admin
  if (request?.url?.includes("/api/auth") && error.statusCode === 500) {
    return true;
  }

  // Erreurs de paiement/commandes
  if (
    request?.url?.includes("/api/orders") ||
    request?.url?.includes("/api/payment")
  ) {
    return true;
  }

  // Erreurs serveur 500
  if (error.statusCode >= 500) {
    return true;
  }

  return false;
}
