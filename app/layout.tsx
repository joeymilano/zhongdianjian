import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '中点见 · 把时间留给相聚',
  description: '同城约见，或跨城相聚。比较每个人的时间与预算，找到大家都能接受的见面方案。',
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
