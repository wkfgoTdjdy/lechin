'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import MembersOnly from '@/components/MembersOnly';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ago } from '@/lib/board';
import Invites from '@/components/Invites';

const ACTIONS = { none: '문제없음', hide: '숨김', warn: '숨김+경고', suspend7: '7일 정지', ban: '영구 정지' };

// 운영자 화면: 처리 대기 신고. 운영자가 아니면 DB가 목록을 주지 않는다 (이 화면의 검사는 안내용).
function Admin() {
  const { member } = useAuth();
  const [reports, setReports] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('reports').select('*').eq('status', 'open').order('created_at');
    if (error) return setMsg('신고 목록을 불러오지 못했어요: ' + error.message);
    setReports(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(id, action) {
    if (action !== 'none' && !confirm(`"${ACTIONS[action]}" 조치를 할까요?`)) return;
    const { error } = await supabase.rpc('resolve_report', { p_id: id, p_action: action });
    if (error) setMsg('처리하지 못했어요: ' + error.message);
    load();
  }

  // 공지: '자유' 게시판에 "[공지] 제목" 글이 올라가고 모든 회원에게 알림이 간다 (supabase/007)
  async function announce(e) {
    e.preventDefault();
    const form = e.target, { title, body } = Object.fromEntries(new FormData(form));
    if (!confirm('모든 회원에게 알림이 가요. 공지를 보낼까요?')) return;
    const { error } = await supabase.rpc('announce', { p_title: title.trim(), p_body: body.trim() });
    setMsg(error ? '공지를 보내지 못했어요: ' + error.message : '공지를 보냈어요.');
    if (!error) form.reset();
  }

  if (!member.is_admin) return <p className="empty">운영자만 볼 수 있어요.</p>;
  return (
    <section>
      <Link className="back" href="/">← 목록으로</Link>
      <h1>처리 대기 신고 {reports?.length ?? ''}</h1>
      <ul className="list">
        {reports?.map((r) => (
          <li key={r.id} className="reportRow">
            <div><span className="tagc">{r.reason}</span> <strong>{r.target_nick}</strong>
              <span className="meta"> · {ago(r.created_at)} · 이 회원이 받은 대기 신고 {reports.filter((o) => o.target_member === r.target_member).length}건</span>
              {r.article_id && <> · <Link href={`/p/${r.article_id}`}>글 보기</Link></>}
            </div>
            <p className="body">{r.snapshot}</p>
            {r.detail && <p className="meta" style={{ whiteSpace: 'pre-wrap' }}>신고자 설명: {r.detail}</p>}
            <div>{Object.entries(ACTIONS).map(([a, label]) => (
              <button key={a} type="button" className="link" onClick={() => resolve(r.id, a)}>{label}</button>
            ))}</div>
          </li>
        ))}
        {reports?.length === 0 && <li className="empty">대기 중인 신고가 없어요.</li>}
      </ul>
      <h1>운영자 초대 코드</h1>
      <p className="meta" style={{ whiteSpace: 'normal' }}>이메일로 요청받은 분께 드리는 코드예요. 하나를 한 번만 쓸 수 있어요.</p>
      <Invites fn="admin_invites" create="admin_new_invite" />
      <h1>공지 보내기</h1>
      <form id="writeForm" onSubmit={announce}>
        <label>제목 <input type="text" name="title" maxLength={70} required /></label>
        <label>내용 <textarea name="body" rows={6} maxLength={5000} required /></label>
        <p className="meta" style={{ whiteSpace: 'normal', margin: 0 }}>개인정보 처리방침을 바꿀 때는 시행 7일 전에 여기로 알려요.</p>
        <div className="row"><button>모든 회원에게 보내기</button></div>
      </form>
      <p id="msg" role="alert">{msg}</p>
    </section>
  );
}

export default function AdminPage() {
  return <MembersOnly><Admin /></MembersOnly>;
}
