import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getMembershipForUser } from "@/lib/auth/membership";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/set-password", "/auth/onboarding"];
const PUBLIC_API_PREFIXES = ["/api/cron", "/api/gmail/callback"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") return true;

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  return false;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginPath = pathname === "/login" || pathname.startsWith("/login/");
  const isOnboardingPath = pathname === "/auth/onboarding" || pathname.startsWith("/auth/onboarding/");
  if (!isLoginPath && !isOnboardingPath && isPublicPath(pathname)) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
        }
        response = NextResponse.next({ request });
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isLoginPath) {
    if (!user) return response;
    const membership = await getMembershipForUser({ userId: user.id, supabase: supabase as any });
    if (membership?.companyId) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.redirect(new URL("/auth/onboarding", request.url));
  }

  if (isOnboardingPath) {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
    const membership = await getMembershipForUser({ userId: user.id, supabase: supabase as any });
    if (membership?.companyId) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    if (!pathname.startsWith("/api")) {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/api")) return response;
  const membership = await getMembershipForUser({ userId: user.id, supabase: supabase as any });
  if (!membership?.companyId) {
    return NextResponse.redirect(new URL("/auth/onboarding", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
