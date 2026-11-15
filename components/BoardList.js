'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, HOBBY_AT, ago } from '@/lib/board';
import Upcoming from '@/components/Upcoming';
import { useAuth } from '@/lib/auth';
import { useRoomCounts } from '@/lib/presence';

const PAGE = 30;   // 한 번에 불러오는 글 수

function fetchPage(cat, from) {
  let query = supabase.from('articles').select('id, category, title, author, nickname, created_at, comments(count)')
    .order('created_at', { ascending: false }).range(from, from + PAGE - 1);
  if (cat) query = query.eq('category', cat);
  return query;
}

// 글 목록. 주소의 ?c=카테고리 로 걸러 본다.
export default function BoardList() {
  const param = useSearchParams().get('c');
  const cat = CATEGORIES.includes(param) ? param : null;
  const [posts, setPosts] = useState(null);   // null = 불러오는 중
  const [hasMore, setHasMore] = useState(false);
  const [msg, setMsg] = useState('');
  const { blocked } = useAuth();
  const counts = useRoomCounts(true);   // 취미 공간에 지금 있는 사람 수

  useEffect(() => {
    let stale = false;   // 카테고리를 빠르게 바꿨을 때 늦게 온 예전 결과는 버린다
    setPosts(null);
    fetchPage(cat, 0).then(({ data, error }) => {
      if (stale) return;
      if (error) return setMsg('글 목록을 불러오지 못했어요: ' + error.message);
      setMsg('');
      setPosts(data);
      setHasMore(data.length === PAGE);
    });
    return () => { stale = true; };
  }, [cat]);

  async function loadMore() {
    const { data, error } = await fetchPage(cat, posts.length);
    if (error) return setMsg('글 목록을 불러오지 못했어요: ' + error.message);
    setPosts([...posts, ...data]);
    setHasMore(data.length === PAGE);
  }

  return (
    <section>
      <Upcoming cat={cat} />
      <div className="bar">
        <nav id="cats" aria-label="카테고리">
          <Link href="/" aria-current={cat ? undefined : 'page'}>전체</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/?c=${encodeURIComponent(c)}`} aria-current={c === cat ? 'page' : undefined}
              title={counts[c] ? `지금 오두막의 ${c} 공간에 ${counts[c]}명` : undefined}>{c}{counts[c] > 0 && <span className="count"> ●{counts[c]}</span>}</Link>
          ))}
        </nav>
        {HOBBY_AT[cat] && <a className="btn" href={`/lounge?at=${HOBBY_AT[cat]}`}>🚪 {cat} 공간으로</a>}
        <Link className="btn" href={cat ? `/write?c=${encodeURIComponent(cat)}` : '/write'}>✏️ 글쓰기</Link>
      </div>
      <ul className="list">
        {posts?.filter((a) => !blocked.has(a.author)).map((a) => {
          const n = a.comments?.[0]?.count ?? 0;
          return (
            <li key={a.id}>
              <Link href={`/p/${a.id}`}>
                <span className="tagc">{a.category}</span>
                <span className="title">{a.title}{n > 0 && <span className="count"> [{n}]</span>}</span>
                <span className="meta">{a.nickname} · {ago(a.created_at)}</span>
              </Link>
            </li>
          );
        })}
        {posts?.length === 0 && <li className="empty">아직 글이 없어요. 첫 글을 써 보세요.</li>}
        {posts === null && !msg && <li className="empty">불러오는 중…</li>}
      </ul>
      {hasMore && <button type="button" id="more" onClick={loadMore}>더 보기</button>}
      <p id="msg" role="alert">{msg}</p>
    </section>
  );
}
