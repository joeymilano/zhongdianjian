'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { CITY_SUGGESTIONS } from '../src/travel-data';
import { defaultTrip, GOALS, tripSchema, nextDay, type Trip, type Goal, type Member } from '../src/model';
import LocalPlanner from './local-planner';
import type { Plan } from '../src/planner';
import type { Comparison, Hotels } from '../src/travel-service';

type Draft = { trip: Trip; questions: string[]; changes: string[]; provider: string };
type Status = { travel: boolean; ai: boolean; engine?: string };
const COLORS = ['#ef8250', '#739e88', '#889ecb', '#b590ad'];
const money = (fen: number) => '¥' + (fen / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const duration = (minutes: number) => `${Math.floor(minutes / 60)}h${Math.round(minutes % 60) ? ` ${Math.round(minutes % 60)}m` : ''}`;
const time = (value: number | string) => typeof value === 'string' ? value.slice(11, 16) : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
const dayTime = (value: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(265_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '暂时无法完成请求');
  return data;
}

type IconName = 'arrow' | 'train' | 'calendar' | 'tune' | 'plus' | 'chevron' | 'spark' | 'clock' | 'wallet' | 'pin' | 'check' | 'close';
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    train: <><rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 11h14M12 3v8M8 18l-2 3m10-3 2 3M8 14h1m6 0h1"/></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 5h2"/></>,
    tune: <><path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, chevron: <path d="m8 10 4 4 4-4"/>,
    spark: <><path d="m10 3 2.5 6.5L19 12l-6.5 2.5L10 21l-2.5-6.5L1 12l6.5-2.5Z"/><path d="m19 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
    wallet: <><path d="M19 7H6a2 2 0 0 1 0-4h12v4M5 7H4v12a2 2 0 0 0 2 2h13V7"/><path d="M19 11h-5v6h5M16 14h.1"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  };
  return <svg className={`ui-icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Mark({ small = false }: { small?: boolean }) {
  return <svg aria-hidden="true" width={small ? 24 : 32} height={small ? 24 : 32} viewBox="0 0 40 40"><path d="M6 5h10v10h8V5h10v12a7 7 0 0 1-7 7h-3v11H14V24h-1a7 7 0 0 1-7-7Z" fill="currentColor"/><circle cx="20" cy="19" r="4" fill="white"/></svg>;
}
function Person({ index, size = 34 }: { index: number; size?: number }) {
  return <span className="person" aria-hidden="true" style={{ '--avatar-size': `${size}px`, backgroundPosition: `${index * 100 / 3}% center` } as React.CSSProperties}/>;
}
function Art({ name, className = '', eager = false }: { name: 'rail' | 'wallet' | 'together'; className?: string; eager?: boolean }) {
  return <Image className={`art-image ${className}`} src={`/art/${name}.webp`} alt="" width={480} height={480} sizes="(max-width: 760px) 160px, 240px" loading={eager ? 'eager' : 'lazy'}/>;
}
function RouteArt({ members }: { members: Member[] }) {
  const points = [[64,73],[284,87],[84,263],[292,265]];
  return <div className="route-art" role="img" aria-label={`出发城市示意：${members.map(m => m.city).join('、')}。非实际地理位置或已查询路线。`}>
    <div className="map-grid"/>
    <svg className="map-lines" viewBox="0 0 360 330" aria-hidden="true">
      {members.map((m,i) => <path className="route-line" key={m.id} d={`M${points[i][0]} ${points[i][1]} Q${points[i][0]} 177 187 185`} fill="none" stroke={COLORS[i]} strokeWidth="1.3" strokeDasharray="3 5" opacity=".65"/>)}
      {members.map((m,i) => <g key={m.id}><circle cx={points[i][0]} cy={points[i][1]} r="5" fill={COLORS[i]}/><circle cx={points[i][0]} cy={points[i][1]} r="10" fill="none" stroke={COLORS[i]} opacity=".18"/></g>)}
    </svg>
    {members.map((m,i) => <div className={`map-label map-label-${i}`} key={m.id}><Person index={i} size={26}/><div><strong>{m.city}</strong><span>{m.name}</span></div></div>)}
    <Art name="together" className="map-meeting-art" eager/>
    <div className="map-center-label">把时间留给彼此</div>
    <span className="map-caption">出发城市示意 · 非实际线路</span>
  </div>;
}

export default function MeetingPlanner({ initialTrip }: { initialTrip: Trip }) {
  const [mode, setMode] = useState<'rail'|'local'>('rail');
  const [candidate, setCandidate] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('示例条件，可直接修改');
  const [result, setResult] = useState<Comparison | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal>('fair');
  const [lodging, setLodging] = useState<Hotels | null>(null);
  const [explanation, setExplanation] = useState<{ summary: string; suggestion: string } | null>(null);
  const [expired, setExpired] = useState(false);
  const [removedCities, setRemovedCities] = useState<string[]>([]);
  const prior = useRef<Comparison | null>(null);
  const resultArea = useRef<HTMLDivElement>(null);
  const version = useRef(0);

  useEffect(() => {
    setTrip(defaultTrip());
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => setStatus(null));
    try {
      const stored = localStorage.getItem('zhongdianjian-trip-v1');
      const parsed = stored ? tripSchema.safeParse(JSON.parse(stored)) : null;
      if (parsed?.success) { setTrip(parsed.data); setNotice('已恢复这台设备上的条件'); }
    } catch {}
  }, []);
  useEffect(() => {
    if (!result) return;
    const update = () => setExpired(Date.now() >= Date.parse(result.expiresAt));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [result]);

  useEffect(() => { if (!busy) return; setElapsed(0); const t=setInterval(()=>setElapsed(n=>n+1),1000); return ()=>clearInterval(t); },[busy]);
  function updateTrip(next: Trip) {
    if (result) prior.current = result;
    version.current++;
    setTrip(next); setResult(null); setLodging(null); setExplanation(null); setRemovedCities([]); setError(''); setDraft(null);
    setNotice(prior.current ? '条件已改变，重新查询后比较新方案' : '条件已更新');
    try { localStorage.setItem('zhongdianjian-trip-v1', JSON.stringify(next)); } catch {}
  }
  function updateMember(index: number, field: keyof Member, value: string | number) {
    updateTrip({ ...trip, members: trip.members.map((p, i) => i === index ? { ...p, [field]: value } : p) });
  }
  async function parseText() {
    if (!text.trim()) return;
    const v = version.current;
    setBusy('parse'); setError(''); setDraft(null);
    try { const data = await post<Draft>('/api/parse', { text, current: trip }); if (v === version.current) setDraft(data); }
    catch (e) { setError((e as Error).name === 'TimeoutError' ? '查询等待时间过长，请稍后重试。当前条件已保留。' : (e as Error).message); }
    finally { setBusy(''); }
  }
  async function compare(refresh = false) {
    const validation = tripSchema.safeParse(trip);
    if (!validation.success) { setError(validation.error.issues.map(x => x.message).join('；')); return; }
    if (busy) return;
    if (new Set(trip.members.map(m=>m.city)).size===1 && trip.cities.every(c=>c===trip.members[0].city)) { setError('大家都在同一座城市，请切换「同城见面」，填写各自的具体地点。'); return; }
    const v = version.current;
    setBusy('compare'); setError(''); setLodging(null); setExplanation(null);
    try {
      const next = await post<Comparison>('/api/compare', { trip, refresh });
      if (v !== version.current) return;
      setRemovedCities(prior.current?.feasibleCities.filter(city => !next.feasibleCities.includes(city)) || []);
      setResult(next); setGoal('fair');
      setNotice('仅比较当前覆盖城市与已返回车次');
      resultArea.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { setError((e as Error).name === 'TimeoutError' ? '查询等待时间过长，请稍后重试。当前条件已保留。' : (e as Error).message); }
    finally { setBusy(''); }
  }
  const selected = result?.plans.find(p => p.goal === goal) || result?.plans[0];
  async function loadHotels(plan: Plan) {
    const v = version.current;
    setBusy('hotels'); setError('');
    try { const data = await post<Hotels>('/api/hotels', { city: plan.city, date: trip.date }); if (v === version.current) setLodging(data); }
    catch (e) { setError((e as Error).name === 'TimeoutError' ? '查询等待时间过长，请稍后重试。当前条件已保留。' : (e as Error).message); }
    finally { setBusy(''); }
  }
  async function explain() {
    if (!result) return;
    const v = version.current;
    setBusy('explain'); setError('');
    try { const data = await post<{ summary: string; suggestion: string }>('/api/explain', { id: result.id }); if (v === version.current) setExplanation(data); }
    catch (e) { setError((e as Error).name === 'TimeoutError' ? '查询等待时间过长，请稍后重试。当前条件已保留。' : (e as Error).message); }
    finally { setBusy(''); }
  }
  return <>
    <a href="#planner" className="skip-link">跳转到会合条件</a>
    <header className="site-header shell">
      <a className="brand" href="/" aria-label="中点见首页"><Mark/><span>中点见<span className="brand-en">meet halfway</span></span></a>
      <nav aria-label="主导航"><a className="nav-active" href="#planner">见面计划</a><a href="#how">关于中点</a></nav>
      <span className="region-tag"><Icon name="train" size={15}/> 同城 / 跨城 · 2–4 人</span>
    </header>
    <main className="shell">
      <section className="hero">
        <div className="hero-copy"><div className="hero-kicker"><span className="ticket-mark"><Icon name="train" size={15}/></span> 下一站，久别重逢 <span className="kicker-rule"/></div><h1>各自出发，<br/><span>在中点见。</span></h1><p>找到时间、路程和预算都合适的那一站。<br/>让见面这件事，对每个人都轻松一点。</p><div className="hero-actions"><a className="button hero-cta" href="#planner">计划一次见面<Icon name="arrow" size={16}/></a><div className="hero-companions"><span>{trip.members.map((m,i) => <Person key={m.id} index={i} size={29}/>)}</span><small>{trip.members.length} 个人的周末</small></div></div></div>
        <div className="hero-visual"><span className="visual-orbit orbit-one"/><span className="visual-orbit orbit-two"/><Image src="/art/meet-town.webp" alt="原创微缩旅行插画：朋友乘列车，从不同方向来到水乡咖啡馆相聚" className="town-art" width={1536} height={1024} sizes="(max-width: 760px) 92vw, 640px" fetchPriority="high" loading="eager"/><div className="reunion-ticket"><span className="ticket-punch"/><span className="ticket-caption">NEXT STOP</span><strong>好好见一面</strong><span className="ticket-icon"><Icon name="pin" size={19}/></span></div><span className="art-disclosure">相聚灵感插画</span></div>
      </section>
      <div className="planner-intro"><div><span className="section-index">01</span><h2>把大家的安排，放在一起。</h2></div><span><Icon name="calendar" size={14}/> {mode === 'rail' ? '跨城过周末' : '同城见一面'}</span></div>
      <div className="meeting-modes" aria-label="见面类型"><button type="button" aria-pressed={mode==='rail'} onClick={()=>setMode('rail')} disabled={!!busy}>跨城相聚 <span>比较铁路往返</span></button><button type="button" aria-pressed={mode==='local'} onClick={()=>setMode('local')} disabled={!!busy}>同城见面 <span>从具体地点出发</span></button></div>
      <datalist id="city-suggestions">{CITY_SUGGESTIONS.map(c=><option value={c} key={c}/>)}</datalist>
      {mode === 'local' ? <LocalPlanner/> : <>
      <section className="planner-frame" id="planner" aria-label="见面计划">
        <div className="workspace-bar"><div className="workspace-title"><Icon name="train"/><span>周末见面计划</span></div><div className="step-indicator"><span className="current"><b>1</b> 大家的安排</span><span className="step-line"/><span className={result ? 'current' : ''}><b>2</b> 找到中点</span></div></div>
        <div className="workspace">
          <section className="form-panel">
            <div className="intent-box"><div className="intent-label"><Icon name="spark" size={16}/><label htmlFor="intent">一句话，说说大家的安排</label><span className="ai-label">AI</span></div><textarea id="intent" value={text} disabled={!!busy} onChange={e => setText(e.target.value)} maxLength={3000} placeholder="比如：我们从上海、南京和合肥出发，想找个地方过周末…" rows={2}/><div className="intent-bottom"><span>整理后由你确认</span><button type="button" className="text-button" disabled={!!busy || !text.trim()} onClick={parseText}>{busy === 'parse' ? '正在整理…' : '整理条件'}<Icon name="arrow" size={15}/></button></div></div>
            {draft && <div className="draft-box" aria-live="polite"><strong>核对这次修改</strong>{draft.changes.length ? <ul>{draft.changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p>没有明确的条件变更。</p>}{draft.questions.length > 0 && <div className="clarify"><b>还需要确认</b><ul>{draft.questions.map((q,i) => <li key={i}>{q}</li>)}</ul><p>补充说明后重新整理，或直接修改下方条件。</p></div>}<div className="button-row"><button className="button small-button" disabled={draft.questions.length > 0 || !draft.changes.length} onClick={() => { updateTrip(draft.trip); setText(''); }}>确认应用</button><button className="text-button" onClick={() => setDraft(null)}>取消</button></div></div>}
            <form noValidate id="meeting-form" onInvalidCapture={e => {
              e.preventDefault();
              const input = e.target as HTMLInputElement;
              const member = input.closest<HTMLElement>('[data-member-id]');
              if (member) setExpandedMember(member.dataset.memberId || null);
              const details = input.closest('details');
              if (details) details.open = true;
              setError(`请检查${input.getAttribute('aria-label') || '填写内容'}：填写有效值后再查询。`);
              requestAnimationFrame(() => input.focus());
            }} onSubmit={e => { e.preventDefault(); void compare(); }}>
              <fieldset disabled={!!busy}><legend className="sr-only">会合条件</legend>
                <div className="date-row"><span className="field-icon"><Icon name="calendar"/></span><label>出发<input aria-label="出发日期" type="date" value={trip.date} required onChange={e => updateTrip({ ...trip, date: e.target.value })}/></label><span className="date-arrow">→</span><div className="return-date"><span>返程</span><strong>{nextDay(trip.date || initialTrip.date).replaceAll('-', '.')}</strong></div><span className="night-tag">住 1 晚</span></div>
                <div className="members-heading"><h2>一起出发的人 <span>{trip.members.length}/4</span></h2><span className="form-notice" aria-live="polite">{notice}</span></div>
                <div className="members">{trip.members.map((member, index) => <section className={`member-card ${expandedMember === member.id ? 'member-open' : ''}`} key={member.id} data-member-id={member.id} aria-label={`成员 ${index + 1}`}>
                  <div className="member-main"><Person index={index}/><div className="member-identity"><input aria-label={`成员${index+1}称呼`} value={member.name} maxLength={16} required onChange={e => updateMember(index, 'name', e.target.value)}/><span>往返 ≤ ¥{member.budget} · {member.maxRideHours} 小时</span></div><div className="city-field"><Icon name="pin" size={14}/><input list="city-suggestions" aria-label={`${member.name}出发城市`} value={member.city} placeholder="出发城市" maxLength={20} onChange={e=>updateMember(index,'city',e.target.value)}/></div><button type="button" className="edit-member" aria-label={`编辑${member.name}条件`} aria-expanded={expandedMember === member.id} aria-controls={`constraints-${member.id}`} onClick={() => setExpandedMember(expandedMember === member.id ? null : member.id)}><Icon name="tune" size={16}/><span>条件</span></button>{trip.members.length > 2 && <button type="button" className="remove" aria-label={`移除${member.name}`} onClick={() => updateTrip({ ...trip, members: trip.members.filter(p => p.id !== member.id) })}><Icon name="close" size={14}/></button>}</div>
                  <div className="member-time-summary"><span>{member.earliestDeparture} 后出发</span><span className="summary-divider"/><span>次日 {member.latestReturn} 前到家</span></div>
                  <div className="member-fields" id={`constraints-${member.id}`} hidden={expandedMember !== member.id}>
                    <label>最早出发<input aria-label={`${member.name}最早出发`} type="time" required value={member.earliestDeparture} onChange={e => updateMember(index, 'earliestDeparture', e.target.value)}/></label>
                    <label>次日最晚到家<input aria-label={`${member.name}最晚回家`} type="time" required value={member.latestReturn} onChange={e => updateMember(index, 'latestReturn', e.target.value)}/></label>
                    <label>往返交通预算<div className="input-unit"><input aria-label={`${member.name}交通预算`} type="number" required min={0} max={3000} step={1} value={member.budget} onChange={e => updateMember(index, 'budget', Number(e.target.value))}/><span>元</span></div></label>
                    <label>往返乘车上限<div className="input-unit"><input aria-label={`${member.name}乘车时长上限`} type="number" required min={0.25} max={24} step={0.25} value={member.maxRideHours} onChange={e => updateMember(index, 'maxRideHours', Number(e.target.value))}/><span>小时</span></div></label>
                  </div>
                </section>)}</div>
                {trip.members.length < 4 && <button type="button" className="add-member" onClick={() => updateTrip({ ...trip, members: [...trip.members, { id: `m${Date.now()}`, name: `朋友 ${trip.members.length}`, city: '苏州', earliestDeparture: '09:00', latestReturn: '21:00', budget: 300, maxRideHours: 6 }] })}><Icon name="plus" size={16}/> 添加同行的人</button>}
                <details className="preferences" open><summary><span><Icon name="tune" size={16}/> 候选城市与偏好</span><span>{trip.cities.length} 座候选城市 <Icon name="chevron" size={14}/></span></summary><div className="city-checks">{trip.cities.map(city => <button type="button" className="city-chip" key={city} aria-label={`移除候选城市${city}`} onClick={()=>updateTrip({...trip,cities:trip.cities.filter(c=>c!==city)})}>{city} ×</button>)}</div><div className="candidate-add"><input aria-label="添加候选会合城市" list="city-suggestions" value={candidate} onChange={e=>setCandidate(e.target.value)} placeholder="输入城市，如武汉、成都" maxLength={20}/><button type="button" className="outline-button" disabled={trip.cities.length>=8 || !candidate.trim()} onClick={()=>{const c=candidate.trim();if(!/^[\u3400-\u9fff]{2,20}$/.test(c)){setError('请填写中文城市名');return;}if(!trip.cities.includes(c))updateTrip({...trip,cities:[...trip.cities,c]});setCandidate('');}}>加入比较</button></div><p className="small muted">国内城市可输入；先选 1–3 座，最多 8 座。只比较这些候选与实际返回车次。</p><div className="preferences-grid"><label>共同停留至少<div className="input-unit"><input type="number" min={1} max={36} required aria-label="最短共同停留小时" value={trip.minTogetherHours} onChange={e => updateTrip({ ...trip, minTogetherHours: Number(e.target.value) })}/><span>小时</span></div><span className="small muted">包含夜间，未扣市内接驳</span></label><label>还有什么偏好<input maxLength={500} placeholder="比如：安静的地方，坐下来聊天" value={trip.preferences} onChange={e => updateTrip({ ...trip, preferences: e.target.value })}/><span className="small muted">供讨论参考，不作为硬性筛选</span></label></div></details>
              </fieldset>
            </form>
          </section>
          <aside className={`sidebar ${busy === 'compare' ? 'is-searching' : ''}`}>
            <div className="map-heading"><span><span className="tiny-dot"/> {trip.members.length} 个出发点，一个目的地</span><span>跨城铁路</span></div>
            {busy === 'compare' ? <div className="search-illustration" role="status"><Art name="rail" eager/><span className="search-track"/><strong>正在为大家找一站</strong><p>云端查询往返车次，逐一核对时间与预算</p><span className="search-dots"><i/><i/><i/></span></div> : <RouteArt members={trip.members}/>}
            <div className="outcome-preview"><h3><span>一起找到，</span><span>刚刚好的中点。</span></h3><p>每个人的时间与预算，都算数。</p><div className="goal-tags"><span><Icon name="clock" size={14}/> 少赶路</span><span><Icon name="wallet" size={14}/> 少花费</span><span><Icon name="spark" size={14}/> 多相聚</span></div></div>
            <div className="search-area"><button type="button" onClick={()=>void compare()} disabled={!!busy} className="button search-button">{busy === 'compare' ? <><span className="spinner"/> 正在查询往返车次…</> : <>找到我们的中点<Icon name="arrow" size={18}/></>}</button>{busy==='compare' && <p role="status" className="query-feedback">已开始查询 · {elapsed} 秒<br/>正在比较 {trip.cities.length} 座城市，云端查询可能需要几分钟。</p>}{error && <div className="inline-error" role="alert">{error}</div>}<p className="form-foot">比较真实车次 · 交通费按每人往返计算</p></div>
          </aside>
        </div>
        <div className="workspace-foot"><span><Icon name="check" size={13}/> 自动保存在当前设备</span>{status && (!status.travel || !status.ai) ? <span className="connection-status"><span className="status-dot"/> {(!status.travel && !status.ai) ? '云端智能体待接通' : !status.travel ? '旅行服务待接入' : 'AI 服务待接入'}</span> : <span>住宿与市内接驳另计</span>}</div>
      </section>
      <div ref={resultArea} className="results-anchor"/>
      {result && <section className="results"><div className="section-line"><span>02 / 在这里见</span><span className="section-line-right">{result.source} · {time(Date.parse(result.queriedAt))} 查询</span></div><div className="results-head"><div><h2>{result.plans.length ? '适合我们的，原来在这里。' : '这次，还没有都合适的方案。'}</h2><p className="muted">{result.partial ? '部分路线数据不完整，已排除无法核验的组合。' : '已核对每个人的时间、乘车时长和交通预算。'} 共同窗口包含夜间，未扣市内接驳。</p></div><button className="outline-button" disabled={!!busy} onClick={() => compare(true)}>刷新报价 ↻</button></div>
        {removedCities.length > 0 && <div className="change-note">条件改变后，{removedCities.join('、')}不再进入可行结果。具体原因见下方筛选记录。</div>}
        {expired && <div className="change-note" role="status">这轮报价已过期。请刷新后再前往预订。</div>}
        <div className="plan-cards">{result.plans.map(plan => <button type="button" key={plan.id} disabled={!!busy} className={`plan-card ${selected?.id === plan.id ? 'selected' : ''}`} onClick={() => { setGoal(plan.goal); setLodging(null); }} aria-pressed={selected?.id === plan.id}><Art name={plan.goal === 'fair' ? 'rail' : plan.goal === 'cheap' ? 'wallet' : 'together'} className="plan-art"/><div className="plan-label">{GOALS[plan.goal].name}<span>{selected?.id === plan.id ? '●' : '○'}</span></div><h3>{plan.city}<span>见</span></h3><p>{GOALS[plan.goal].detail}</p><div className="plan-number">{plan.goal === 'fair' ? duration(plan.maxRideMinutes) : plan.goal === 'cheap' ? money(plan.totalFen) : duration(plan.togetherMinutes)}</div><span className="small muted">{plan.goal === 'fair' ? '最长往返乘车时间' : plan.goal === 'cheap' ? '全组往返交通费' : '共同停留窗口'}</span></button>)}</div>
        {selected && <div className="journey-panel"><div className="journey-heading"><div><span className="kicker">EVERY JOURNEY COUNTS</span><h3>每个人，怎样抵达{selected.city}。</h3></div><div className="journey-total"><strong>{money(selected.totalFen)}</strong><span>全组往返交通费</span></div></div><div className="table-wrap"><table><caption className="sr-only">{selected.city}会合往返车次对比</caption><thead><tr><th>谁 / 从哪来</th><th>去见面 · {trip.date.slice(5)}</th><th>再回家 · {nextDay(trip.date).slice(5)}</th><th>往返乘车</th><th>交通费用</th></tr></thead><tbody>{selected.journeys.map((p,i) => <tr key={p.memberId}><td><span className="journey-person"><Person index={i} size={27}/><strong>{p.name}</strong></span><span className="cell-sub">{p.origin}</span></td>{(['outbound','inbound'] as const).map(way => <td key={way}>{p[way] ? <><b>{time(p[way]!.departure)} → {time(p[way]!.arrival)}</b><span className="cell-sub">{p[way]!.departureStation} → {p[way]!.arrivalStation}</span><span className="cell-sub">{p[way]!.trainNo} · {p[way]!.seat}</span>{!expired && <a className="booking-link" target="_blank" rel="noopener noreferrer" href={p[way]!.bookingUrl}>去飞猪核价预订 ↗</a>}</> : <><b>就在本地</b><span className="cell-sub">无需跨城铁路</span></>}</td>)}<td><b>{duration(p.rideMinutes)}</b></td><td><strong>{money(p.fareFen)}</strong><span className="cell-sub">预算 {money(Math.round(trip.members.find(m => m.id === p.memberId)!.budget * 100))}</span></td></tr>)}</tbody></table></div><div className="window-note"><span>相聚窗口</span><strong>{dayTime(selected.windowStart)} — {dayTime(selected.windowEnd)}</strong><span>包含夜间 · 未扣市内接驳</span></div><p className="small muted">由百炼 Managed Agent 执行 · {result.execution.sessions.length} 个云端会话 · 搜索结果不保证余票，价格和可订状态以飞猪预订页为准。</p><div className="button-row"><button className="button" disabled={!!busy || expired} onClick={() => loadHotels(selected)}>{busy === 'hotels' ? '正在查找…' : `看看${selected.city}的住宿`} <span>↗</span></button><button className="text-button" disabled={!!busy} onClick={explain}>{busy === 'explain' ? '正在解释…' : '请百炼解释这些取舍'}</button></div></div>}
        {explanation && <div className="explanation"><span className="kicker">百炼 · 取舍说明</span><p>{explanation.summary}</p><p className="muted">{explanation.suggestion}</p></div>}
        {lodging && <div className="lodging"><h3>在{lodging.city}住一晚</h3><p className="muted">{lodging.disclaimer}</p><div className="hotel-grid">{lodging.results.length ? lodging.results.map((h,i) => <article className="hotel-card" key={`${h.name}-${i}`}>{h.image && <img src={h.image} alt={h.name} loading="lazy" referrerPolicy="no-referrer"/>}<div><h4>{h.name}</h4><p>{h.address}</p><strong>{h.price.kind === 'exact' ? `${money(h.price.fen)} · 搜索报价` : '价格待核实'}</strong><a target="_blank" rel="noopener noreferrer" href={h.url}>核对房型与预订 ↗</a></div></article>) : <p>这次搜索没有返回可核验的住宿信息。</p>}</div><p className="small muted">查询于 {dayTime(Date.parse(lodging.queriedAt))}。{lodging.hint}</p></div>}
        {result.exclusions.length > 0 && <details className="exclusions" open={!result.plans.length}><summary>查看筛选记录 <span>{result.exclusions.length} 条</span></summary><ul>{result.exclusions.map((item,i) => <li key={i}><b>{item.city}{item.member ? ` · ${item.member}` : ''}</b><span>{item.reason}</span><em>{item.kind === 'data' ? '数据未核实' : '条件不满足'}</em></li>)}</ul></details>}
        {result.platformHints.map((hint,i) => <p className="small muted" key={i}>{hint}</p>)}
      </section>}
      </>}
      <section className="how-section" id="how"><div className="how-heading"><span className="kicker">CLOSER, IN EVERY WAY</span><h2>见面的路，可以更刚好。</h2><p>从三个角度，找到大家都舒服的选择。</p></div><div className="principles"><article className="principle-rail"><div className="principle-art"><Art name="rail"/></div><div className="principle-copy"><span className="principle-number">01 / 少赶路</span><h3>让最远的人，<br/>也能轻松一点。</h3><p>优先减少全组最长的往返乘车时间。</p></div><span className="principle-corner"><Icon name="clock" size={17}/></span></article><article className="principle-wallet"><div className="principle-art"><Art name="wallet"/></div><div className="principle-copy"><span className="principle-number">02 / 少花费</span><h3>每个人的预算，<br/>都值得被照顾。</h3><p>各自不超预算，再比较全组花费。</p></div><span className="principle-corner"><Icon name="wallet" size={17}/></span></article><article className="principle-together"><div className="principle-art"><Art name="together"/></div><div className="principle-copy"><span className="principle-number">03 / 多相聚</span><h3>多留一点时间，<br/>给好久没见的我们。</h3><p>从最后一位到达，算到第一位离开。</p></div><span className="principle-corner"><Icon name="spark" size={17}/></span></article></div><div className="coverage"><span><Icon name="pin" size={14}/> 从你所在的地方出发</span><p>同城具体地点 · 国内跨城铁路</p><span>覆盖与可用结果以地图、铁路服务实际返回为准</span></div></section>
    </main><footer className="shell site-footer"><a href="/" className="footer-brand"><Mark small/> 中点见</a><span>下次见，就在中点。</span><span>2026 · 飞猪 AI 旅行创新大赛参赛项目</span></footer>
  </>;
}
