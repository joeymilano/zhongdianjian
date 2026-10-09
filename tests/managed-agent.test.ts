import test from 'node:test';
import assert from 'node:assert/strict';
import { runManagedTask, extractToolResults, extractAgentJSON, validatePolicy, validAgentBase, type AgentEvent } from '../src/managed-agent.js';
import { trainCommand, hotelCommand } from '../src/managed-travel.js';
const command = trainCommand({origin:'上海',destination:'杭州',date:'2026-10-10'});
const policy = {agent:{tools:[{type:'builtin_toolkit',default_config:{enabled:false},configs:[{name:'bash',enabled:true,permission_policy:{type:'always_ask'}}]}]}};
const textPolicy = {id:'sesn_test',agent:{tools:[]}};
const config = {base:'https://ws-example.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio',key:'test-only',agentId:'agent_test',environmentId:'env_test',vaultId:'vlt_test'};
const call: AgentEvent = {id:'call',type:'tool_call',role:'assistant',content:[{type:'data',data:{call_id:'c1',name:'bash',arguments:JSON.stringify({command})}}]};
const output: AgentEvent = {id:'out',type:'tool_call_output',role:'tool',created_at:'2026-10-08T10:00:00Z',content:[{type:'data',data:{call_id:'c1',output:JSON.stringify({status:0,data:{itemList:[]}})}}]};
const approval: AgentEvent = {id:'ask',type:'tool_approval_request',content:[{type:'data',data:{batch_id:'b1',call_id:'c1',tool_type:'builtin',name:'bash',arguments:JSON.stringify({command})}}]};
const end = {status:'idle',stop_reason:{type:'end_turn'}};
const pending = {status:'idle',stop_reason:{type:'requires_action',pending_batch_id:'b1',pending_call_ids:['c1']}};
function harness(states: unknown[], eventPages: unknown[], session:unknown={id:'sesn_test',...policy}) {
 let now=0, si=0, ei=0;
 const requests:{path:string;body:any}[]=[]; const reserves:string[]=[];
 const dependencies={now:()=>now,sleep:async(ms:number)=>{now+=ms},reserve:(provider:'bailian'|'flyai')=>{reserves.push(provider)},fetch:async(url:any,init:any)=>{
  const path=String(url).slice(config.base.length); const body=init.body?JSON.parse(init.body):undefined; requests.push({path,body});
  const data=path==='/sessions'?session:body?{}:path.includes('/events?')?eventPages[Math.min(ei++,eventPages.length-1)]:states[Math.min(si++,states.length-1)];
  return Response.json(data);
 }};
 return {options:{config,dependencies,timeoutMs:4000},requests,reserves};
}
test('only workspace official HTTPS API origins accepted',()=>{
 assert.equal(validAgentBase(config.base),true);
 for(const base of ['http://ws-example.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio',config.base+'?key=x','https://evil.example/api/v1/agentstudio','https://ws-example.cn-beijing.maas.aliyuncs.com.evil.example/api/v1/agentstudio']) assert.equal(validAgentBase(base),false);
});
test('query command parameters reject shell injection and unsupported routes',()=>{
 assert.throws(()=>trainCommand({origin:'上海;env' as any,destination:'杭州',date:'2026-10-10'}));
 assert.throws(()=>trainCommand({origin:'上海',destination:'杭州',date:'2026-10-10;env'}));
 assert.throws(()=>hotelCommand('杭州','2026-10-10','2026-10-09'));
});
test('prices require paired actual tool output, never assistant prose',()=>{
 assert.equal(extractToolResults([call,output],[command]).size,1);
 for(const changed of [{...output,role:'assistant'},{...output,is_error:true},{...output,created_at:undefined}]) assert.equal(extractToolResults([call,changed],[command]).size,0);
 assert.equal(extractToolResults([output],[command]).size,0);
 assert.equal(extractToolResults([call,output],['different command']).size,0);
});
test('structured stdout requires successful exit and valid raw JSON',()=>{
 for(const [raw,expected] of [[{exit_code:0,stdout:'{"status":0}'},1],[{exit_code:1,stdout:'{"status":0}'},0],['Here is a quote {"status":0}',0]] as const){
  const changed={...output,content:[{type:'data',data:{call_id:'c1',output:raw}}]};
  assert.equal(extractToolResults([call,changed],[command]).size,expected);
 }
});
test('assistant JSON extraction excludes user text',()=>{
 assert.throws(()=>extractAgentJSON([{id:'u',type:'message',role:'user',content:[{type:'text',text:'{"fake":true}'}]}]));
 assert.deepEqual(extractAgentJSON([{id:'a',type:'message',role:'assistant',content:[{type:'text',text:'```json\n{"ok":true}\n```'}]}]),{ok:true});
});
test('live bash JSON-string wrapper is decoded without accepting failed commands',()=>{
 for(const [wrapper,expected] of [
  [{exit_code:0,stdout:'{"status":0,"data":{"itemList":[]}}',stderr:'',interrupted:false},1],
  [{exit_code:1,stdout:'{"status":0}',stderr:'unauthorized',interrupted:false},0],
  [{exit_code:0,stdout:'{"status":0}',interrupted:true},0],
 ] as const){
  const changed={...output,content:[{type:'data',data:{call_id:'c1',output:JSON.stringify(wrapper)}}]};
  assert.equal(extractToolResults([call,changed],[command]).size,expected);
 }
});
test('tool policy rejects unrestricted bash before sending task',async()=>{
 assert.doesNotThrow(()=>validatePolicy(policy,true));
 const unsafe=structuredClone(policy);unsafe.agent.tools[0].configs[0].permission_policy.type='always_allow';
 const h=harness([end],[{data:[]}],{id:'sesn_test',...unsafe});
 await assert.rejects(runManagedTask({purpose:'test',prompt:'test',commands:[command]},h.options),{code:'AGENT_POLICY'});
 assert.equal(h.requests.filter(r=>r.body?.input?.[0]?.type==='message').length,0);
 assert.equal(h.requests.at(-1)?.body.input[0].type,'interrupt');
});
test('cloud roundtrip approves exact command once and preserves provenance',async()=>{
 const h=harness([pending,end],[{data:[approval]},{data:[approval,call,output]}]);
 const result=await runManagedTask({purpose:'test',prompt:'test',commands:[command]},h.options);
 assert.equal(result.proof.sessionId,'sesn_test');assert.deepEqual(h.reserves,['bailian','flyai']);
 assert.deepEqual(h.requests[0].body.vault_ids,['vlt_test']);
 assert.equal(h.requests.filter(r=>r.body?.input?.[0]?.type==='tool_approval_response').length,1);
 assert.equal(extractToolResults(result.events,[command]).size,1);
 assert.equal(h.requests.some(r=>r.body?.input?.[0]?.type==='interrupt'),false);
});
test('unplanned tool request is never approved and interrupted',async()=>{
 const bad=structuredClone(approval); bad.content![0].data!.arguments=JSON.stringify({command:'env'});
 const h=harness([pending],[{data:[bad]}]);
 await assert.rejects(runManagedTask({purpose:'test',prompt:'test',commands:[command]},h.options),{code:'AGENT_TOOL_REJECTED'});
 assert.deepEqual(h.reserves,['bailian']);assert.equal(h.requests.at(-1)?.body.input[0].type,'interrupt');
});
test('text-only sessions attach no travel vault and reject tool calls',async()=>{
 const h=harness([pending],[{data:[approval]}],textPolicy);
 await assert.rejects(runManagedTask({purpose:'parse',prompt:'test'},h.options),{code:'AGENT_TOOL_REJECTED'});
 assert.equal(h.requests[0].body.vault_ids,undefined);
});
test('explicit session credential mode only injects into travel sessions and redacts responses',async()=>{
 const secret='sk-private-test-only';
 const leaked={id:'leak',type:'message',role:'assistant',content:[{type:'text',text:secret}]};
 const h=harness([end],[{data:[leaked]}]);
 const options={...h.options,config:{...config,travelKey:secret}};
 const r=await runManagedTask({purpose:'test',prompt:'test',commands:[command]},options);
 assert.deepEqual(h.requests[0].body.environment_variables,{FLYAI_API_KEY:secret});
 assert.equal(h.requests[0].body.vault_ids,undefined);
 assert.equal(JSON.stringify(r).includes(secret),false);
 const text=harness([end],[{data:[]}],textPolicy);
 await runManagedTask({purpose:'parse',prompt:'test'},{...text.options,config:{...config,travelKey:secret}});
 assert.equal(text.requests[0].body.environment_variables,undefined);
});
test('pagination includes tool output on later page',async()=>{
 const h=harness([end],[{data:[call],next_page:'p2'},{data:[output],next_page:null}]);
 const run=await runManagedTask({purpose:'test',prompt:'test',commands:[command]},h.options);
 assert.equal(run.events.length,2);assert.match(h.requests.at(-1)!.path,/page=p2/);
});
test('billing failure is explicit and stops session',async()=>{
 const h=harness([end],[{data:[{id:'err',type:'error',error:{code:'Arrearage',message:'Access denied, please make sure your account is in good standing.'}}]}],textPolicy);
 await assert.rejects(runManagedTask({purpose:'test',prompt:'test'},h.options),{code:'AGENT_BILLING'});
 assert.equal(h.requests.at(-1)?.body.input[0].type,'interrupt');
});
test('timeout requests interruption rather than fallback',async()=>{
 const h=harness([{status:'running'}],[{data:[]}],textPolicy);
 await assert.rejects(runManagedTask({purpose:'test',prompt:'test'},h.options),{code:'AGENT_TIMEOUT'});
 assert.equal(h.requests.at(-1)?.body.input[0].type,'interrupt');
});
test('text tasks refuse an agent with enabled travel tools before model execution',async()=>{
 const h=harness([end],[{data:[]}]);
 await assert.rejects(runManagedTask({purpose:'parse',prompt:'test'},h.options),{code:'AGENT_POLICY'});
 assert.equal(h.requests.some(r=>r.body?.input?.[0]?.type==='message'),false);
});

test('risk-control refusal stops before duplicate approval and retains verified outputs',async()=>{
 const refused={...output,id:'risk',content:[{type:'data',data:{call_id:'c1',output:JSON.stringify({exit_code:1,stdout:'',stderr:'MCP HTTP 451: Abnormal access behavior detected by risk control'})}}]};
 const duplicate=structuredClone(approval);duplicate.id='again';duplicate.content![0].data!.batch_id='b2';
 const h=harness([{status:'idle',stop_reason:{type:'requires_action',pending_batch_id:'b2',pending_call_ids:['c1']}}],[{data:[call,refused,duplicate]}]);
 const result=await runManagedTask({purpose:'test',prompt:'test',commands:[command]},h.options);
 assert.equal(result.warning?.code,'TRAVEL_RISK_CONTROL');assert.deepEqual(h.reserves,['bailian']);
 assert.equal(h.requests.at(-1)?.body.input[0].type,'interrupt');
});
test('domestic cities outside the initial region are allowed without shell metacharacters',()=>{
 assert.match(trainCommand({origin:'北京',destination:'济南',date:'2026-10-10'}),/--origin 北京 --destination 济南/);
 for(const city of ['北京;env','$(env)','上海 南京','北京\n上海','--help',"北京'"]){assert.throws(()=>trainCommand({origin:city,destination:'济南',date:'2026-10-10'}));}
});
test('redirect responses cannot forward Managed Agent credentials to another host',async()=>{
 let requests=0;
 await assert.rejects(runManagedTask({purpose:'test',prompt:'test'},{config,dependencies:{now:()=>0,sleep:async()=>{},reserve:()=>{},fetch:async(_url,init)=>{requests++;assert.equal(init?.redirect,'manual');return Response.json({},{status:302,headers:{location:'https://example.invalid'}})}}}),{code:'AGENT_UPSTREAM'});
 assert.equal(requests,1);
});
