'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ago, when } from '@/lib/board';

// 알림 종. 읽지 않은 수를 보여 주고, 열면 최근 알림 20개가 나온다. 열 때 모두 읽음으로 바뀐다.
export default function Bell({ memberId }) {
  const [items, setItems] = useState([]);
  const [soon, setSoon] = useState([]);   // 36시간 안에 시작하는 내 확정 모임 ("내일 모임" 알림을 대신한다)

  const load = useCallback(async () => {
    const until = new Date(Date.now() + 36 * 3600e3).toISOString();
    const [n, s] = await Promise.all([
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('rsvps').select('meetup_id, meetups!inner(starts_at, status, articles(title))')
        .eq('member', memberId).eq('status', 'going').eq('meetups.status', 'open')
        .gte('meetups.starts_at', new Date().toISOString()).lte('meetups.starts_at', until),
    ]);
    setItems(n.data ?? []);
    setSoon(s.data ?? []);
  }, [memberId]);

  useEffect(() => {
    load();
    // 접속해 있는 동안 새 알림이 오면 바로 다시 불러온다
    const channel = supabase.channel('bell-' + memberId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member=eq.${memberId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, memberId]);

  const unread = items.filter((n) => !n.read && !n.seen).length + soon.length;
  async function opened(e) {
    if (!e.target.open || !items.some((n) => !n.read)) return;
    await supabase.from('notifications').update({ read: true }).eq('member', memberId).eq('read', false);
    setItems((list) => list.map((n) => ({ ...n, seen: true })));   // 숫자만 지우고, 새 알림 표시는 닫을 때까지 둔다
  }

  return (
    <details className="bell" onToggle={opened}>
      <summary aria-label={`알림 ${unread}개`}>🔔{unread > 0 && <b>{unread}</b>}</summary>
      <ul>
        {soon.map((s) => (
          <li key={'s' + s.meetup_id}><Link href={`/p/${s.meetup_id}`}>곧 모임이에요: 「{s.meetups.articles.title}」 {when(s.meetups.starts_at)}</Link></li>
        ))}
        {items.map((n) => (
          <li key={n.id} className={n.read ? '' : 'new'}>
            {n.article_id ? <Link href={`/p/${n.article_id}`}>{n.body}</Link> : n.body}
            <span className="meta"> {ago(n.created_at)}</span>
          </li>
        ))}
        {!items.length && !soon.length && <li className="meta">알림이 없어요.</li>}
      </ul>
    </details>
  );
}
