import { auth } from "@/auth";
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  // /login and /liff are public entry points (the LIFF page runs its own
  // LINE sign-in flow, so it must not be gated by this middleware).
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/liff");
  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login|liff).*)"],
};
