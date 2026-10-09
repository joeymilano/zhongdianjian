import { managedStatus } from '../src/managed-agent.js';
const status = managedStatus();
console.log(JSON.stringify(status,null,2));
if (!status.travelConfigured) process.exitCode=2;
