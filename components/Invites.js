'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// 초대 코드 목록 + 누가 언제 썼는지. fn: my_invites(내 코드) | admin_invites(운영자 코드). create 가 있으면 '새 코드' 단추가 붙는다.
export default function Invites({ fn, create }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc(fn);
    if (error) return setMsg('초대 코드를 불러오지 못했어요: ' + error.message);
    setRows(data);
  }, [fn]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const { error } = await supabase.rpc(create);
    if (error) setMsg('만들지 못했어요: ' + error.message);
    load();
  }
  return (
    <div>
      <ul className="list">
        {rows?.map((i) => (
          <li key={i.invite_code} style={{ padding: '10px 16px' }}>
            <code style={{ textDecoration: i.is_used ? 'line-through' : 'none' }}>{i.invite_code}</code>{' '}
            <span className="meta">
              {/* used_nick·used_at 은 supabase/008 을 실행한 뒤에 온다 */}
              {i.is_used ? `${i.used_nick ?? '탈퇴한 회원'}님이 사용${i.used_at ? ' · ' + new Date(i.used_at).toLocaleDateString('ko-KR') : ''}` : '아직 안 씀'}
            </span>
          </li>
        ))}
        {rows?.length === 0 && <li className="empty">코드가 없어요.</li>}
      </ul>
      {create && <p><button type="button" onClick={add}>새 코드 만들기</button></p>}
      {msg && <p role="alert" className="meta">{msg}</p>}
    </div>
  );
}
