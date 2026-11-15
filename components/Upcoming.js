'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SIDO, when } from '@/lib/board';
import { useAuth } from '@/lib/auth';

// 다가오는 모임 (가까운 날짜부터). cat 이 있으면 그 취미만, 시·도로도 걸러 본다.
export default function Upcoming({ cat }) {
  const [sido, setSido] = useState('');
  const [rows, setRows] = useState(null);
  const mine = useAuth().member.interests ?? [];   // 관심 취미 모임을 위로

  useEffect(() => {
    let stale = false;
    // ponytail: 가까운 10개만. 모임이 많아지면 더 보기를 붙인다.
    let q = supabase.from('meetups')
      .select('article_id, starts_at, sido, district, capacity, articles!inner(title, category), rsvps(count)')
      .eq('status', 'open').gte('starts_at', new Date().toISOString()).eq('rsvps.status', 'going')
      .order('starts_at').limit(10);
    if (cat) q = q.eq('articles.category', cat);
    if (sido) q = q.eq('sido', sido);
    q.then(({ data, error }) => { if (!stale) setRows(error ? [] : data); });   // 못 불러오면 조용히 비운다 (아래 글 목록이 오류를 보여 준다)
    return () => { stale = true; };
  }, [cat, sido]);

  return (
    <section className="meets">
      <div className="bar">
        <strong style={{ marginRight: 'auto' }}>다가오는 모임</strong>
        <select value={sido} onChange={(e) => setSido(e.target.value)} aria-label="지역" style={{ width: 'auto' }}>
          <option value="">전국</option>
          {SIDO.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <ul className="list">
        {rows?.toSorted((a, b) => mine.includes(b.articles.category) - mine.includes(a.articles.category)).map((m) => (
          <li key={m.article_id}>
            <Link href={`/p/${m.article_id}`}>
              <span className="tagc">{m.articles.category}</span>
              <span className="title">{m.articles.title}</span>
              <span className="meta">{when(m.starts_at)} · {m.sido} {m.district} · {(m.rsvps[0]?.count ?? 0) + 1}/{m.capacity}명</span>
            </Link>
          </li>
        ))}
        {rows?.length === 0 && <li className="empty">예정된 모임이 없어요. 글쓰기에서 모임을 열어 보세요.</li>}
      </ul>
    </section>
  );
}
