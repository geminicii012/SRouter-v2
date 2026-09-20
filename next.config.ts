import type { NextConfig } from "next";

/**
 * Header keamanan yang DINAMIS.
 *
 * Masalah sebelumnya: `Strict-Transport-Security` dikirim TANPA SYARAT.
 * HSTS hanya boleh dikirim saat koneksi memang HTTPS. Kalau dikirim lewat
 * HTTP (mis. http://bore.pub:38700), browser akan MENGUNCI host itu ke HTTPS
 * dan menolak akses HTTP — situs jadi tidak bisa dibuka.
 *
 * Sekarang: HSTS hanya saat HTTPS. Header lain aman di kedua protokol.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "4mb" } },

  async headers() {
    return [
      {
        // dasar: berlaku di HTTP maupun HTTPS
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // beri tahu browser bahwa origin ini memang bisa dipakai di dua protokol
          { key: "Vary", value: "Origin, X-Forwarded-Proto" },
        ],
      },
      {
        // HSTS HANYA untuk HTTPS. `has` membuat Next hanya memasang header ini
        // kalau request datang lewat HTTPS (x-forwarded-proto: https).
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // HTML shell: JANGAN biarkan di-cache lama.
        // Masalah nyata: `/` di-prerender statis lalu dikirim dengan
        // s-maxage=31536000 (1 tahun) + x-nextjs-cache: HIT. Setelah deploy
        // baru, user masih menerima HTML lama yang menunjuk chunk lama.
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=0, must-revalidate" },
        ],
      },
      {
        source: "/:path((?!_next/static).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=0, must-revalidate" },
        ],
      },
      {
        // Aset ber-hash: aman di-cache selamanya. Nama file berubah tiap build.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
