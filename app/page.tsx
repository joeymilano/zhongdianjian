import MeetingPlanner from './planner-client';
import { defaultTrip } from '../src/model';
export const dynamic = 'force-dynamic';
export default function Home() { return <MeetingPlanner initialTrip={defaultTrip()} />; }
