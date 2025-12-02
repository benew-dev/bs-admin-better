import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

// Configuration
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

// Rate limiting simple (pour Vercel gratuit)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 100; // 100 requêtes par minute

// Fonction de rate limiting basique
function checkRateLimit(identifier) {
  const now = Date.now();
  const userRequests = requestCounts.get(identifier) || [];

  // Nettoyer les anciennes requêtes
  const recentRequests = userRequests.filter(
    (time) => now - time < RATE_LIMIT_WINDOW,
  );

  if (recentRequests.length >= MAX_REQUESTS) {
    return false; // Rate limit dépassé
  }

  recentRequests.push(now);
  requestCounts.set(identifier, recentRequests);

  // Nettoyer la map périodiquement
  if (requestCounts.size > 1000) {
    requestCounts.clear();
  }

  return true;
}

// Routes publiques (pas d'authentification requise)
const PUBLIC_PATHS = [
  "/", // Page de login
  "/_next/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/images/",
  "/api/auth/", // Routes d'authentification Better Auth
];

// Chemins suspects à bloquer
const SUSPICIOUS_PATHS = [
  "/.env",
  "/wp-admin",
  "/phpMyAdmin",
  "/.git",
  "/config",
  "/backup",
  "/.aws",
  "/admin.php",
  "/login.php",
  "/shell.php",
];

export async function middleware(req) {
  const { pathname, origin } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";

  if (!IS_PRODUCTION && DEBUG) {
    console.log("[Admin Middleware] Path:", pathname, "IP:", ip);
  }

  // ============================================
  // 1. PROTECTION CONTRE LES SCANS DE SÉCURITÉ
  // ============================================
  if (SUSPICIOUS_PATHS.some((path) => pathname.includes(path))) {
    console.warn(
      `[SECURITY] Suspicious path access attempt: ${pathname} from ${ip}`,
    );
    return new NextResponse(null, { status: 404 });
  }

  // ============================================
  // 2. ROUTES PUBLIQUES - SORTIE RAPIDE
  // ============================================
  const isPublic = PUBLIC_PATHS.some((publicPath) =>
    pathname.startsWith(publicPath),
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // ============================================
  // 3. AUTHENTIFICATION BETTER AUTH
  // ============================================
  let session = null;
  let userRole = null;
  let userEmail = null;
  let userId = null;

  try {
    const auth = await getAuth();
    session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      // Pas de session valide
      if (!IS_PRODUCTION && DEBUG) {
        console.log("[Admin Middleware] No valid session");
      }

      const loginUrl = new URL("/", req.url);
      loginUrl.searchParams.set("error", "authentication_required");
      loginUrl.searchParams.set("callbackUrl", pathname);

      const response = NextResponse.redirect(loginUrl);
      response.headers.set("X-Redirect-Reason", "no-session");
      return response;
    }

    // Récupérer les infos utilisateur
    userRole = session.user.role;
    userEmail = session.user.email;
    userId = session.user.id;

    if (!IS_PRODUCTION && DEBUG) {
      console.log("[Admin Middleware] Session found:", {
        email: userEmail,
        role: userRole,
      });
    }
  } catch (error) {
    console.error("[Admin Middleware] Authentication error:", {
      path: pathname,
      error: error.message,
      stack: IS_PRODUCTION ? undefined : error.stack,
    });

    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("error", "auth_error");
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("X-Redirect-Reason", "auth-error");
    return response;
  }

  // ============================================
  // 4. VÉRIFICATION DU RÔLE ADMIN
  // ============================================
  if (userRole !== "admin") {
    // Log de tentative d'accès non autorisé
    console.warn(
      `[SECURITY] Unauthorized admin access attempt by ${userEmail || ip} (role: ${userRole}) to ${pathname}`,
    );

    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("error", "unauthorized");
    loginUrl.searchParams.set("message", "Accès réservé aux administrateurs");

    const response = NextResponse.redirect(loginUrl);
    response.headers.set("X-Redirect-Reason", "not-admin");
    return response;
  }

  // ============================================
  // 5. RATE LIMITING (après authentification)
  // ============================================
  if (pathname.startsWith("/api/")) {
    const identifier = userEmail || userId || ip;

    if (!checkRateLimit(identifier)) {
      console.warn(
        `[SECURITY] Rate limit exceeded for ${identifier} on ${pathname}`,
      );

      return new NextResponse(
        JSON.stringify({
          success: false,
          message: "Too many requests. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": MAX_REQUESTS.toString(),
            "X-RateLimit-Window": (RATE_LIMIT_WINDOW / 1000).toString(),
            "Retry-After": "60",
          },
        },
      );
    }
  }

  // ============================================
  // 6. PROTECTION CSRF POUR LES MUTATIONS
  // ============================================
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.headers.get("content-type");

    // Vérifier que c'est une requête légitime
    if (
      !contentType ||
      (!contentType.includes("application/json") &&
        !contentType.includes("multipart/form-data"))
    ) {
      // Exception pour les routes d'auth Better Auth
      if (!pathname.includes("/api/auth/")) {
        console.warn(
          `[SECURITY] Invalid content type from ${userEmail} on ${pathname}`,
        );

        return new NextResponse(
          JSON.stringify({
            success: false,
            message: "Invalid content type",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }
  }

  // ============================================
  // 7. CRÉATION DE LA RÉPONSE AVEC HEADERS DE SÉCURITÉ
  // ============================================
  const response = NextResponse.next();

  // Headers de sécurité pour les APIs
  if (pathname.startsWith("/api/")) {
    // CORS restrictif - seules les requêtes du même domaine
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    // Headers de sécurité supplémentaires
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "0");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }

  // Headers pour les routes admin
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/")) {
    response.headers.set("X-Admin-User", userEmail || "unknown");
    response.headers.set("X-User-Id", userId || "unknown");
    response.headers.set("X-User-Role", userRole);
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private",
    );
  }

  // Marquer comme authentifié
  response.headers.set("X-User-Authenticated", "true");

  if (!IS_PRODUCTION && DEBUG) {
    console.log("[Admin Middleware] Access granted for:", userEmail);
  }

  return response;
}

// Configuration des routes à protéger
export const config = {
  runtime: "nodejs", // ✅ REQUIS pour Next.js 15.2.0+ avec validation de session complète
  matcher: [
    /*
     * Match toutes les routes sauf :
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation d'images)
     * - favicon.ico, robots.txt, sitemap.xml
     * - images publiques
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|images/).*)",
  ],
};
