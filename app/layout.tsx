import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agencia de marketing con agentes',
  description: 'Lectura, análisis y generación de contenido para redes sociales',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
