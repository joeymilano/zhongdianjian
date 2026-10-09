// Only mainland official endpoints; never send a credential to an arbitrary URL.
export function isBailianEndpoint(base: string): boolean {
  try {
    const url = new URL(base);
    const official = url.hostname === 'dashscope.aliyuncs.com' ||
      /^ws-[a-z0-9]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname);
    return official && url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      !url.search && !url.hash && /^\/compatible-mode\/v1\/?$/.test(url.pathname);
  } catch { return false; }
}
