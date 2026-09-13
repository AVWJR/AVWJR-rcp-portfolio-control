import { deleteVaultDocument, readVaultDocument } from "@/lib/vault";
import { NextResponse } from "next/server";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = await readVaultDocument(id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.doc.mimeType,
      "Content-Disposition": `attachment; filename="${found.doc.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteVaultDocument(id);
  return NextResponse.json({ deleted: id });
}
