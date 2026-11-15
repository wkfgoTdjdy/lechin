'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MembersOnly from '@/components/MembersOnly';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, LEVELS, SIDO } from '@/lib/board';

function WriteForm() {
  const router = useRouter();
  const from = useSearchParams().get('c');   // 보던 카테고리로 시작
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [meet, setMeet] = useState(false);   // 모임으로 열기

  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { category, title, body } = f;
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.from('articles').insert({ category, title: title.trim(), body: body.trim() }).select('id').single();
    if (error) { setBusy(false); return setMsg('글을 올리지 못했어요: ' + error.message); }
    if (meet) {
      // ponytail: 글 → 모임 → 장소 순서로 따로 넣는다. 중간에 실패하면 글을 지워 되돌린다. 한 번에 넣으려면 서버 함수로 옮긴다.
      const iso = (v) => (v ? new Date(v).toISOString() : null);
      let { error: err } = await supabase.from('meetups').insert({
        article_id: data.id, starts_at: iso(f.starts_at), sido: f.sido, district: f.district.trim(), capacity: Number(f.capacity),
        level: f.level, approval: f.approval === 'on', fee: f.fee.trim(), pregather_at: iso(f.pregather_at),
      });
      if (!err) ({ error: err } = await supabase.from('meetup_private').insert({ article_id: data.id, place: f.place.trim(), contact: f.contact.trim() }));
      if (err) {
        await supabase.from('articles').delete().eq('id', data.id);
        setBusy(false);
        return setMsg('모임을 열지 못했어요: ' + err.message);
      }
    }
    router.push(`/p/${data.id}`);
  }

  return (
    <form id="writeForm" onSubmit={submit}>
      <label>카테고리
        <select name="category" defaultValue={CATEGORIES.includes(from) ? from : CATEGORIES[0]}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>제목 <input type="text" name="title" maxLength={80} required autoFocus /></label>
      <label>내용 <textarea name="body" rows={10} maxLength={5000} required /></label>
      <label className="check"><input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} /> <span>모임 열기 (날짜·정원을 정하고 참가 신청을 받아요)</span></label>
      {meet && (
        <fieldset>
          <label>일시 <input type="datetime-local" name="starts_at" required /></label>
          <label>시·도 <select name="sido">{SIDO.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>구·군 (여기까지만 모두에게 보여요) <input type="text" name="district" maxLength={20} required placeholder="마포구" /></label>
          <label>정확한 장소 (참가가 확정된 사람에게만 보여요) <input type="text" name="place" maxLength={200} required /></label>
          <label>연락 방법 (선택, 확정된 사람에게만) <input type="text" name="contact" maxLength={200} placeholder="오픈채팅 주소 등" /></label>
          <label>정원 (나 포함) <input type="number" name="capacity" min={2} max={30} defaultValue={6} required /></label>
          <label>수준 <select name="level">{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></label>
          <label>참가비 (선택, 적기만 해요. 결제 기능은 없어요) <input type="text" name="fee" maxLength={40} placeholder="구장비 1만원" /></label>
          <label>오두막에서 미리 만나는 시간 (선택) <input type="datetime-local" name="pregather_at" /></label>
          <label className="check"><input type="checkbox" name="approval" /> <span>신청을 내가 수락해야 확정 (끄면 선착순)</span></label>
          <p className="meta" style={{ whiteSpace: 'normal', margin: 0 }}>첫 모임은 사람이 많은 공개된 장소에서 열어 주세요. 사진은 모두의 동의를 받고 찍어요.</p>
        </fieldset>
      )}
      <div className="row">
        <Link className="back" href="/" style={{ margin: 'auto auto auto 0' }}>취소</Link>
        <button disabled={busy}>올리기</button>
      </div>
      <p id="msg" role="alert">{msg}</p>
    </form>
  );
}

export default function WritePage() {
  return <MembersOnly><Suspense fallback={null}><WriteForm /></Suspense></MembersOnly>;
}
