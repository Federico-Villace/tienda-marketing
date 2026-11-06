import type { Metadata, Viewport } from 'next'
import './globals.css'
import { EnfocarCampos } from '@/components/ui/enfocar-campos'

export const metadata: Metadata = {
  title: 'Agencia de marketing con agentes',
  description: 'Lectura, análisis y generación de contenido para redes sociales',
}

// viewportFit 'cover' deja usar el área segura del iPhone (la barra fija la respeta con env(safe-area-inset-bottom)) y
// 'resizes-content' hace que el teclado achique la página en vez de taparla. El zoom con pellizco sigue permitido.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        <EnfocarCampos />
        {children}
      </body>
    </html>
  )
}
