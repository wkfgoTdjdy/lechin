'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { when } from '@/lib/board';

const LABEL = { going: '참가 확정', waiting: '대기 중', pending: '수락 기다리는 중' };
const DETAIL = { going: '✅ 참가가 확정됐어요', waiting: '⏳ 대기 중이에요 (자리가 나면 자동으로 확정)', pending: '⏳ 여는 사람의 수락을 기다리는 중이에요' };

// 글에 붙은 모임 정보 + 참가 신청. 모임이 아닌 글이면 아무것도 그리지 않는다.
export default function Meetup({ id, isHost, memberId }) {
  const [m, setM] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [place, setPlace] = useState(null);   // 여는 사람·확정자에게만 온다
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('meetups').select('*').eq('article_id', id).maybeSingle(),
      supabase.from('rsvps').select('member, nickname, status').eq('meetup_id', id).order('created_at'),
      supabase.from('meetup_private').select('place, contact').eq('article_id', id).maybeSingle(),
    ]);
    setM(a.data); setRsvps(b.data ?? []); setPlace(c.data);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!m) return null;

  // 요청을 보내고, 실패하면 이유를 보여 주고, 끝나면 다시 불러온다
  const run = async (request) => {
    setMsg('');
    const { error } = await request;
    if (error) setMsg('처리하지 못했어요: ' + error.message);
    load();
  };
  const mine = rsvps.find((r) => r.member === memberId);
  const going = rsvps.filter((r) => r.status === 'going');
  const others = rsvps.filter((r) => r.status !== 'going');
  const open = m.status === 'open' && new Date(m.starts_at) > new Date();

  return (
    <div className="meet">
      <dl>
        <dt>일시</dt><dd>{when(m.starts_at)}{m.status === 'cancelled' && ' (취소됨)'}{m.status === 'held' && ' (열렸어요)'}</dd>
        <dt>지역</dt><dd>{m.sido} {m.district}</dd>
        <dt>정원</dt><dd>{going.length + 1}/{m.capacity}명 · {m.level} · {m.approval ? '여는 사람이 수락' : '선착순'}</dd>
        {m.fee && <><dt>참가비</dt><dd>{m.fee} (결제는 모임에서 직접)</dd></>}
        {m.pregather_at && <><dt>미리 만나기</dt><dd>{when(m.pregather_at)} 오두막에서</dd></>}
        {place
          ? <><dt>장소</dt><dd>{place.place}{place.contact && <><br />연락: {place.contact}</>}</dd></>
          : <><dt>장소</dt><dd>참가가 확정되면 보여요</dd></>}
      </dl>
      {going.length > 0 && <p>오는 사람: {going.map((r) => r.nickname).join(', ')}</p>}

      {!isHost && open && !mine && <button type="button" onClick={() => run(supabase.rpc('join_meetup', { p_meetup: id }))}>참가 신청</button>}
      {!isHost && mine && (
        <p><strong>{DETAIL[mine.status]}</strong>{' '}
          {/* 확정된 뒤에도 취소할 수 있다. 취소하면 여는 사람에게 알림이 간다 (supabase/011) */}
          {open && <button type="button" className="link" onClick={() => confirm(mine.status === 'going' ? '참가를 취소할까요? 여는 사람에게 알림이 가요.' : '신청을 취소할까요?') && run(supabase.from('rsvps').delete().eq('meetup_id', id).eq('member', memberId))}>{mine.status === 'going' ? '참가 취소' : '신청 취소'}</button>}
        </p>
      )}

      {isHost && others.map((r) => (
        <p key={r.member}>{r.nickname} ({LABEL[r.status]}){' '}
          <button type="button" className="link" onClick={() => run(supabase.rpc('accept_rsvp', { p_meetup: id, p_member: r.member }))}>수락</button>
          <button type="button" className="link" onClick={() => run(supabase.from('rsvps').delete().eq('meetup_id', id).eq('member', r.member))}>거절</button>
        </p>
      ))}
      {isHost && m.status === 'open' && (
        <p>
          <button type="button" className="link" onClick={() => run(supabase.from('meetups').update({ status: 'held' }).eq('article_id', id))}>열렸어요</button>
          <button type="button" className="link" onClick={() => confirm('모임을 취소할까요?') && run(supabase.from('meetups').update({ status: 'cancelled' }).eq('article_id', id))}>모임 취소</button>
        </p>
      )}
      <p role="alert" className="meta">{msg}</p>
    </div>
  );
}
