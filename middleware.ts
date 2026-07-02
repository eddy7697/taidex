import { auth } from "@/auth";
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  if (!isLoggedIn && !isLogin) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)"],
};
