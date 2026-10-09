import { managedStatus } from '../../../src/managed-agent';
import { mapConfigured } from '../../../src/local-service';
import { json } from '../../../src/http';
export const runtime = 'nodejs';
export function GET() {
  const status = managedStatus();
  return json({ map: mapConfigured(), travel: status.travelConfigured, ai: status.configured, engine:status.engine, liveVerified:status.liveVerified });
}
