import { NextResponse } from 'next/server';
import { DEMO_MODE, getDemoRunList, DEMO_WRITE_REFUSED } from '../../../../lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (DEMO_MODE) return NextResponse.json(getDemoRunList());

  // Imported lazily so a demo deployment never loads better-sqlite3, which
  // has no database to open there.
  const { listRunsWithSummary } = await import('../../../../lib/models');
  return NextResponse.json(listRunsWithSummary());
}

export async function POST(req: Request) {
  if (DEMO_MODE) {
    return NextResponse.json({ error: DEMO_WRITE_REFUSED }, { status: 503 });
  }

  const body = await req.json();
  if (!body.repoUrl || !body.serverDir) {
    return NextResponse.json({ error: 'Missing repoUrl or serverDir' }, { status: 400 });
  }

  const { createRun } = await import('../../../../lib/models');
  const { runAuditSession } = await import('../../../../lib/engine');

  const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const run = createRun(id, body.repoUrl, body.serverDir);

  // Background start
  runAuditSession(id, body.repoUrl, body.serverDir);

  return NextResponse.json(run);
}
