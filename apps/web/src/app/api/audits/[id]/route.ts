import { NextResponse } from 'next/server';
import { DEMO_MODE, getDemoRun } from '../../../../../lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (DEMO_MODE) {
    const demo = getDemoRun(id);
    if (!demo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(demo);
  }

  // Lazy import: keeps better-sqlite3 out of demo deployments.
  const { getRun, getToolResults, getEvidence } = await import('../../../../../lib/models');

  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ run, results: getToolResults(id), evidence: getEvidence(id) });
}
