'use client';
import { useState } from 'react';
import Link from 'next/link';
import MembersOnly from '@/components/MembersOnly';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/board';
import Invites from '@/components/Invites';

const KINDS = { comment: '내 글에 댓글', rsvp: '참가 신청·확정', meetup: '모임 변경·취소' };

// 내 정보: 관심 취미 · 알림 설정 · 차단 목록 · 탈퇴
function Me() {
  const { member, blocked, refresh } = useAuth();
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    const data = new FormData(e.target);
    const { error } = await supabase.rpc('set_prefs', {
      p_interests: data.getAll('interest'),
      p_muted: Object.keys(KINDS).filter((k) => !data.has('on-' + k)),
    });
    setMsg(error ? '저장하지 못했어요: ' + error.message : '저장했어요.');
    refresh();
  }
  async function unblock(id) {
    await supabase.from('blocks').delete().eq('blocker', member.id).eq('blocked', id);
    refresh();
  }
  async function quit() {
    const typed = prompt('탈퇴하면 계정, 내가 쓴 글·댓글·방명록, 참가 신청, 내가 연 모임이 모두 지워지고 되돌릴 수 없어요.\n계속하려면 닉네임을 입력하세요.');
    if (typed === null) return;
    if (typed.trim() !== member.nickname) return setMsg('닉네임이 달라서 탈퇴하지 않았어요.');
    const { error } = await supabase.rpc('delete_account');
    if (error) return setMsg('탈퇴하지 못했어요: ' + error.message);
    await supabase.auth.signOut();
    await refresh();
  }

  return (
    <section>
      <Link className="back" href="/">← 목록으로</Link>
      <form id="writeForm" onSubmit={save}>
        <strong>{member.nickname}님의 관심 취미</strong>
        <div className="checks">
          {CATEGORIES.filter((c) => c !== '자유').map((c) => (
            <label key={c} className="check"><input type="checkbox" name="interest" value={c} defaultChecked={member.interests?.includes(c)} /> <span>{c}</span></label>
          ))}
        </div>
        <strong>받을 알림</strong>
        <div className="checks">
          {Object.entries(KINDS).map(([k, label]) => (
            <label key={k} className="check"><input type="checkbox" name={'on-' + k} defaultChecked={!member.muted?.includes(k)} /> <span>{label}</span></label>
          ))}
        </div>
        <div className="row"><button>저장</button></div>
        <strong>내 초대 코드 (한 계정에 3개)</strong>
        <Invites fn="my_invites" />
        <strong>차단한 회원</strong>
        {blocked.size === 0 && <span className="meta">없어요.</span>}
        {[...blocked].map(([id, nick]) => (
          <span key={id}>{nick} <button type="button" className="link" onClick={() => unblock(id)}>차단 해제</button></span>
        ))}
        <p id="msg" role="alert">{msg}</p>
        <div className="row"><button type="button" className="link" onClick={quit}>탈퇴</button></div>
      </form>
    </section>
  );
}

export default function MePage() {
  return <MembersOnly><Me /></MembersOnly>;
}
