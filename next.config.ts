import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.68.102',
    '192.168.68.102:3000',
    '192.168.68.106:3000',
    '192.168.68.106',
  ],
  images: {
    // Los originales se conservan intactos en Supabase; aquí solo se generan
    // versiones de entrega por tamaño (tarjeta, ficha) en AVIF/WebP.
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 85],
    deviceSizes: [480, 640, 828, 1080, 1440, 1920, 2560],
    imageSizes: [96, 160, 256, 384],
    minimumCacheTTL: 2678400,
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
}

export default nextConfig
