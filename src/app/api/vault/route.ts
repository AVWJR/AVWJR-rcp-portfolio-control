import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { listVaultDocuments, storeVaultDocument } from "@/lib/vault";
import { isVaultKind } from "@rcp/documents";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity");
  let entityId: string | undefined;
  if (code) {
    const entity = await prisma.entity.findUnique({ where: { code } });
    if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
    entityId = entity.id;
  }
  const docs = await listVaultDocuments(entityId);
  return NextResponse.json(serialize({ documents: docs }));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const code = String(form.get("entity") ?? "");
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const kindRaw = String(form.get("kind") ?? "other");
  if (!isVaultKind(kindRaw)) return NextResponse.json({ error: "Unknown document kind" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const doc = await storeVaultDocument({
      entityId: entity.id,
      kind: kindRaw,
      title: String(form.get("title") ?? file.name),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
      notes: String(form.get("notes") ?? ""),
    });
    return NextResponse.json(serialize({ id: doc.id, title: doc.title, filename: doc.filename }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
