'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export const REASONS = ['개인정보 노출·아우팅', '여성이 아닌 것으로 보임', '미성년으로 보임', '괴롭힘·혐오 표현', '원치 않는 접근', '광고·스팸', '모임 안전 문제', '기타'];
const ERRORS = { 'already reported': '이미 신고한 글이에요.', 'too many reports': '하루에 10건까지 신고할 수 있어요.', 'own content': '내 글은 신고할 수 없어요.' };

// 글·댓글 옆의 '신고'. type: article | comment | post
export default function Report({ type, id }) {
  const [msg, setMsg] = useState('');
  async function submit(e) {
    e.preventDefault();
    const { reason, detail } = Object.fromEntries(new FormData(e.target));
    const { error } = await supabase.rpc('report', { p_type: type, p_id: id, p_reason: reason, p_detail: detail });
    setMsg(error ? (Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? '신고하지 못했어요: ' + error.message)
      : '신고했어요. 운영자가 확인한 뒤 결과를 알림으로 알려 드려요.');
  }
  return (
    <details className="report">
      <summary>신고</summary>
      {msg ? <p role="alert">{msg}</p> : (
        <form onSubmit={submit}>
          <select name="reason" aria-label="신고 사유">{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <textarea name="detail" rows={2} maxLength={500} placeholder="설명 (선택)" aria-label="설명" />
          <button>신고하기</button>
        </form>
      )}
    </details>
  );
}
