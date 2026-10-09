export const CITIES = ['上海', '南京', '杭州', '苏州', '无锡', '常州', '合肥', '宁波'] as const;
export type City = string;
// Chinese city names only: safe as a single CLI argument; not a coverage promise.
export const validCity = (value: string) => /^[\u3400-\u9fff]{2,20}$/.test(value);
export const CITY_SUGGESTIONS = ['北京','天津','上海','重庆','广州','深圳','成都','武汉','西安','长沙','郑州','济南','青岛','厦门','福州','昆明','贵阳','南宁','海口','南昌','合肥','南京','杭州','苏州','无锡','常州','宁波','沈阳','大连','长春','哈尔滨','石家庄','太原','呼和浩特','兰州','银川','西宁','乌鲁木齐','拉萨'];
export type JsonObject = Record<string, unknown>;
export type Price = { kind: 'exact'; fen: number; raw: string } |
  { kind: 'masked' | 'missing' | 'invalid'; raw: string };

export function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

// A masked quote such as "6x" is NOT six yuan. Ranges and "starting at" prices
// also cannot participate in a hard personal-budget constraint.
export function parsePrice(value: unknown): Price {
  if (value == null || value === '') return { kind: 'missing', raw: '' };
  const raw = String(value).trim();
  if (/[xX*×]/.test(raw)) return { kind: 'masked', raw };
  const match = raw.match(/^(?:[¥￥]\s*)?(\d+)(?:\.(\d{1,2}))?(?:\s*元)?$/);
  if (!match) return { kind: 'invalid', raw };
  const fen = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(fen) && fen >= 0 ? { kind: 'exact', fen, raw } : { kind: 'invalid', raw };
}

export function dateTimeInShanghai(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const normalized = value.replace(' ', 'T');
  const epoch = Date.parse(normalized + '+08:00');
  if (!Number.isFinite(epoch)) return null;
  // Date.parse normalizes impossible dates, so compare the components back.
  return new Date(epoch + 8 * 3600_000).toISOString().slice(0, 19) === normalized ? epoch : null;
}

export function isDate(value: string): boolean {
  return dateTimeInShanghai(value + ' 00:00:00') !== null;
}

export function bookingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['fliggy.com', 'feizhu.com', 'taobao.com', 'tb.cn'].some(h => url.hostname === h || url.hostname.endsWith('.' + h)) ? url.href : null;
  } catch { return null; }
}

export type RouteQuery = { origin: City; destination: City; date: string };
export type TrainResult = {
  origin: string; destination: string; departure: string; arrival: string;
  departureStation: string; arrivalStation: string; trainNo: string; seat: string;
  durationMinutes: number; price: Price; bookingUrl: string;
  // The actual trial response has quantity=null. Search results are not a seat guarantee.
  inventoryVerified: boolean;
};
export type TrainAudit = {
  state: 'usable' | 'empty' | 'partial' | 'masked' | 'invalid' | 'upstream_error';
  returned: number; validSchedules: number; exactQuotes: number; maskedQuotes: number;
  rejected: number; results: TrainResult[]; platformHint: string;
};

export function auditTrains(payload: unknown, query: RouteQuery): TrainAudit {
  const root = object(payload);
  const base = { returned: 0, validSchedules: 0, exactQuotes: 0, maskedQuotes: 0, rejected: 0, results: [] as TrainResult[], platformHint: typeof root?.systemMessage === 'string' ? root.systemMessage : '' };
  if (!root || root.status !== 0) return { ...base, state: 'upstream_error' };
  const items = object(root.data)?.itemList;
  if (!Array.isArray(items)) return { ...base, state: 'invalid' };
  if (!items.length) return { ...base, state: 'empty' };
  base.returned = items.length;
  for (const item of items) {
    const row = object(item);
    const journey = Array.isArray(row?.journeys) && row.journeys.length === 1 ? object(row.journeys[0]) : null;
    const segments = journey?.segments;
    const segment = Array.isArray(segments) && segments.length === 1 ? object(segments[0]) : null;
    const departure = dateTimeInShanghai(segment?.depDateTime);
    const arrival = dateTimeInShanghai(segment?.arrDateTime);
    const link = bookingUrl(row?.jumpUrl);
    if (!segment || departure == null || arrival == null || arrival <= departure || !link ||
      segment.depCityName !== query.origin || segment.arrCityName !== query.destination ||
      String(segment.depDateTime).slice(0, 10) !== query.date ||
      segment.quantity === 0 || segment.quantity === '0' ||
      ![segment.depStationName, segment.arrStationName, segment.marketingTransportNo, segment.seatClassName].every(x => typeof x === 'string' && x.length)) {
      base.rejected++; continue;
    }
    const price = parsePrice(row?.adultPrice ?? row?.price);
    if (price.kind === 'exact' && price.fen === 0) { base.rejected++; continue; }
    if (price.kind === 'exact') base.exactQuotes++;
    if (price.kind === 'masked') base.maskedQuotes++;
    base.results.push({ origin: query.origin, destination: query.destination,
      departure: String(segment.depDateTime), arrival: String(segment.arrDateTime),
      departureStation: String(segment.depStationName), arrivalStation: String(segment.arrStationName),
      trainNo: String(segment.marketingTransportNo), seat: String(segment.seatClassName),
      durationMinutes: (arrival - departure) / 60000, price, bookingUrl: link,
      inventoryVerified: typeof segment.quantity === 'number' && segment.quantity > 0,
    });
  }
  base.validSchedules = base.results.length;
  const state = !base.validSchedules ? 'invalid' : !base.exactQuotes ? (base.maskedQuotes ? 'masked' : 'invalid') :
    base.rejected || base.exactQuotes !== base.returned ? 'partial' : 'usable';
  return { ...base, state };
}
