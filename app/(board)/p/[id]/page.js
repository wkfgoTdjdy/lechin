'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import MembersOnly from '@/components/MembersOnly';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ago } from '@/lib/board';
import Meetup from '@/components/Meetup';
import Report from '@/components/Report';

// 글 하나 + 댓글
function Post() {
  const id = Number(useParams().id);
  const router = useRouter();
  const { member, blocked, refresh } = useAuth();
  const [post, setPost] = useState(undefined);   // undefined = 불러오는 중, null = 없는 글
  const [comments, setComments] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(id)) return setPost(null);
    const [a, c] = await Promise.all([
      supabase.from('articles').select('*').eq('id', id).maybeSingle(),
      supabase.from('comments').select('*').eq('article_id', id).order('created_at'),
    ]);
    if (a.error || c.error) return setMsg('글을 불러오지 못했어요: ' + (a.error ?? c.error).message);
    setPost(a.data);
    setComments(c.data);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function addComment(e) {
    e.preventDefault();
    const form = e.target, body = new FormData(form).get('body').trim();
    if (!body) return;
    setBusy(true);
    setMsg('');
    const { error } = await supabase.from('comments').insert({ article_id: id, body });
    setBusy(false);
    if (error) return setMsg('댓글을 올리지 못했어요: ' + error.message);
    form.reset();
    load();
  }
  async function removeComment(commentId) {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) return setMsg('지우지 못했어요: ' + error.message);
    load();
  }
  async function block(author, nickname) {
    if (!confirm(`${nickname}님을 차단할까요? 이 회원의 글과 댓글이 보이지 않게 돼요. (내 정보에서 풀 수 있어요)`)) return;
    const { error } = await supabase.from('blocks').insert({ blocker: member.id, blocked: author, nickname });
    if (error) return setMsg('차단하지 못했어요: ' + error.message);
    await refresh();
  }
  // 내 글이 아니면 신고·차단을 붙인다
  const tools = (type, row) => row.author !== member.id && (
    <>
      <button type="button" className="link" onClick={() => block(row.author, row.nickname)}>차단</button>
      <Report type={type} id={row.id} />
    </>
  );
  async function removePost() {
    if (!confirm('이 글을 지울까요? 댓글도 함께 지워져요.')) return;
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error) return setMsg('지우지 못했어요: ' + error.message);
    router.push('/');
  }

  return (
    <section>
      <Link className="back" href="/">← 목록으로</Link>
      {post === null && <p className="empty">지워졌거나 없는 글이에요.</p>}
      {post && (
        <article>
          <span className="tagc">{post.category}</span>
          <h1>{post.title}</h1>
          <div className="meta">
            {post.nickname} · {ago(post.created_at)}{' '}
            {post.hidden && <strong> · 숨겨진 글 </strong>}
            {post.author === member.id && <button type="button" className="link" onClick={removePost}>삭제</button>}
            {tools('article', post)}
          </div>
          <Meetup id={id} isHost={post.author === member.id} memberId={member.id} />
          <p className="body">{post.body}</p>
          <strong>댓글 {comments.length}개</strong>
          <ul id="comments">
            {comments.filter((c) => !blocked.has(c.author)).map((c) => (
              <li key={c.id}>
                <strong>{c.nickname}</strong> <span className="meta">{ago(c.created_at)}</span>{' '}
                {c.author === member.id && <button type="button" className="link" onClick={() => removeComment(c.id)}>삭제</button>}
                {tools('comment', c)}
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
          <form id="commentForm" onSubmit={addComment}>
            <input name="body" maxLength={1000} required placeholder="댓글 달기…" aria-label="댓글" />
            <button disabled={busy}>등록</button>
          </form>
        </article>
      )}
      <p id="msg" role="alert">{msg}</p>
    </section>
  );
}

export default function PostPage() {
  return <MembersOnly><Post /></MembersOnly>;
}
