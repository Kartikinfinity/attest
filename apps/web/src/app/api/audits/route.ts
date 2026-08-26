import { NextResponse } from 'next/server';
import { createRun, listRuns } from '../../../../lib/models';
import { runAuditSession } from '../../../../lib/engine';

export const dynamic = 'force-dynamic';
export async function GET() {
  const runs = listRuns();
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.repoUrl || !body.serverDir) {
    return NextResponse.json({ error: 'Missing repoUrl or serverDir' }, { status: 400 });
  }
  
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const run = createRun(id, body.repoUrl, body.serverDir);
  
  // Background start
  runAuditSession(id, body.repoUrl, body.serverDir);
  
  return NextResponse.json(run);
}
