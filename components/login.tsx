const ERRORES: Record<string, string> = {
  credenciales: 'Email o contraseña incorrectos.',
  sin_acceso: 'Tu usuario no tiene acceso a esta organización. Pedíselo a quien administra la plataforma.',
  sin_config: 'El login no está configurado en este servidor.',
}

const campo =
  'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-3 py-2 text-sm'

export function FormularioLogin({ error, volver }: { error?: string; volver?: string }) {
  return (
    <form method="post" action="/api/auth/login" className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {ERRORES[error] ?? 'No se pudo entrar. Probá de nuevo.'}
        </p>
      )}
      <label className="block text-sm">
        Email
        <input name="email" type="email" required autoComplete="email" className={campo} />
      </label>
      <label className="block text-sm">
        Contraseña
        <input name="password" type="password" required autoComplete="current-password" className={campo} />
      </label>
      {volver && <input type="hidden" name="volver" value={volver} />}
      <button
        type="submit"
        className="w-full rounded-md bg-(--color-tinta) px-4 py-2 text-sm font-medium text-(--color-papel)"
      >
        Entrar
      </button>
    </form>
  )
}
