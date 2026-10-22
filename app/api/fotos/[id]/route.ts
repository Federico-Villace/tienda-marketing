import { manejarBorradoFoto } from '@/lib/productor/borrar-foto'

// En Next 16 `params` es una Promise (ver app/api/creativos/[id]/route.ts).
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarBorradoFoto(request, id, process.env, fetch)
}
