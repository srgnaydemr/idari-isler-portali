import type { NextRequest } from "next/server";

/**
 * Reverse proxy / hosting arkasında tarayıcının dışarıdan gördüğü origin'i korur.
 * Sabit localhost, IP veya bilgisayar adına bağlı değildir.
 */
export function localRedirectUrl(request: NextRequest, targetPath: string) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";

  if (!host) return new URL(targetPath, request.url);
  return new URL(targetPath, `${protocol}://${host}`);
}
