import { NextResponse } from 'next/server';
import { getRun, getToolResults, getEvidence } from '../../../../../lib/models';

export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const results = getToolResults(id);
  const evidence = getEvidence(id);

  return NextResponse.json({ run, results, evidence });
}
