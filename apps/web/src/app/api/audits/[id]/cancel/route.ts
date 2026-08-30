import { NextResponse } from 'next/server';
import { cancelAuditSession } from '../../../../../../lib/engine';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await cancelAuditSession(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    // cancelAuditSession only throws when the run genuinely doesn't exist --
    // a TrueForge-side cancel failure is handled internally and still marks
    // the run cancelled, so it does not surface here.
    return NextResponse.json({ error: err?.message ?? 'Cancel failed' }, { status: 404 });
  }
}
