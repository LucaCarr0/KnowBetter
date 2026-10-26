import { networkInterfaces } from 'node:os'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

/** @param {string} phase @returns {import('next').NextConfig} */
export default function nextConfig(phase) {
  // Next checks the URL's hostname, so allow this computer's current LAN addresses.
  const localAddresses = phase === PHASE_DEVELOPMENT_SERVER
    ? Object.values(networkInterfaces()).flatMap((entries) =>
        (entries ?? [])
          .filter((entry) => entry.family === 'IPv4' && !entry.internal)
          .map((entry) => entry.address),
      )
    : []

  return {
    allowedDevOrigins: [...new Set(['127.0.0.1', ...localAddresses])],
    images: {
      unoptimized: true,
    },
  }
}
