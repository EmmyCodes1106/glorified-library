import { loadAsset } from "@/lib/ebooks";
import {
  READING_HEADERS,
  authoriseReading,
  parseId,
} from "@/lib/member-reading";

type Params = { params: Promise<{ bookId: string; index: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { bookId, index } = await params;
  const access = await authoriseReading(parseId(bookId));
  if (!access.ok) {
    return new Response(null, {
      status: access.status,
      headers: READING_HEADERS,
    });
  }

  const assetIndex = parseId(index);
  if (assetIndex === null) {
    return new Response(null, { status: 404, headers: READING_HEADERS });
  }

  const asset = await loadAsset(access.access.file, assetIndex);
  if (!asset.ok) {
    return new Response(null, { status: 404, headers: READING_HEADERS });
  }

  return new Response(Buffer.from(asset.bytes), {
    headers: {
      ...READING_HEADERS,
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.bytes.byteLength),
      "Content-Disposition": "inline",
      "Content-Security-Policy": "sandbox",
    },
  });
}
