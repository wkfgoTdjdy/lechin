'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const PLEDGE = '이곳이 성인 여성 전용 공간임을 확인했고, 저는 만 19세 이상 여성입니다.';

// 로그인 전 화면: 소개 + 로그인 / 초대 코드로 가입. 로그인만 하고 초대 코드를 안 넣은 사람에게는 코드 입력만 보인다.
export default function Landing() {
  const { session, refresh } = useAuth();
  const [tab, setTab] = useState('login');
  const [msg, setMsg] = useState(supabase ? '' : '가입 기능이 아직 설정되지 않아, 지금은 오두막만 혼자 둘러볼 수 있어요.');
  const [busy, setBusy] = useState(false);

  // 폼 제출: 처리하는 동안 버튼을 잠그고, 끝나면 로그인 상태를 다시 확인한다
  const submit = (handler) => async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await handler(Object.fromEntries(new FormData(e.target)));
      await refresh();
    } catch (err) {
      console.error(err);
      setMsg('연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  // 초대 코드 확인은 서버(redeem_invite 함수)가 한다. 여기서는 결과만 보여 준다.
  async function redeem(code, nickname) {
    const { error } = await supabase.rpc('redeem_invite', { p_code: code, p_nickname: nickname });
    if (error) setMsg(error.message.includes('invalid invite code') ? '초대 코드가 올바르지 않거나 이미 사용됐어요.' : '가입을 마치지 못했어요: ' + error.message);
  }
  const login = submit(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg('이메일 또는 비밀번호를 확인해 주세요.');
  });
  const join = submit(async ({ email, password, nickname, code }) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg('가입하지 못했어요: ' + error.message);
    if (!data.session) return setMsg('확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인하면 초대 코드를 넣을 수 있어요.');
    await redeem(code, nickname);   // 코드가 틀리면 로그인된 채로 "초대 코드 입력" 화면이 뜬다
  });
  const finish = submit(({ code, nickname }) => redeem(code, nickname));

  const codeFields = (
    <>
      <label>닉네임 <input type="text" name="nickname" maxLength={20} required /></label>
      <label>초대 코드 <input type="text" name="code" autoComplete="off" required /></label>
      <label className="check"><input type="checkbox" required /> <span>{PLEDGE}</span></label>
    </>
  );

  return (
    <section id="landing">
      <div className="closet" aria-hidden="true">
        <svg className="cat" viewBox="0 0 120 110">
          <path d="M22 44 L30 8 L54 30 Z M98 44 L90 8 L66 30 Z" fill="#f3b27a" />
          <ellipse cx="60" cy="62" rx="48" ry="44" fill="#fbf4e8" />
          <path d="M60 18 C86 18 106 38 108 60 C92 56 74 44 60 18 Z" fill="#f3b27a" />
          <ellipse cx="42" cy="62" rx="5" ry="7" fill="#2a2222" /><ellipse cx="78" cy="62" rx="5" ry="7" fill="#2a2222" />
          <ellipse cx="60" cy="72" rx="3.5" ry="2.5" fill="#f29a9a" />
          <path d="M8 66 H24 M8 74 H24 M96 66 H112 M96 74 H112" stroke="#2a2222" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div className="door l" /><div className="door r" />
      </div>
      <h1>레친자들</h1>
      <p>풋살, 농구, 러닝, 헬스, 보드게임, 더블데이트, 독서. 같이 할 친구를 찾고, 숲속 오두막에서 고양이가 되어 먼저 만나요. 초대받은 분만 들어올 수 있어요.</p>

      {supabase && !session && (
        <div>
          <div id="tabs">
            <button type="button" aria-pressed={tab === 'login'} onClick={() => { setTab('login'); setMsg(''); }}>로그인</button>
            <button type="button" aria-pressed={tab === 'join'} onClick={() => { setTab('join'); setMsg(''); }}>초대 코드로 가입</button>
          </div>
          {tab === 'login' ? (
            <form onSubmit={login}>
              <label>이메일 <input type="email" name="email" autoComplete="email" required /></label>
              <label>비밀번호 <input type="password" name="password" autoComplete="current-password" required /></label>
              <button disabled={busy}>로그인</button>
            </form>
          ) : (
            <form onSubmit={join}>
              <label>이메일 <input type="email" name="email" autoComplete="email" required /></label>
              <label>비밀번호 (8자 이상) <input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
              {codeFields}
              <button disabled={busy}>가입하기</button>
            </form>
          )}
        </div>
      )}

      {supabase && session && (
        <form onSubmit={finish}>
          {codeFields}
          <button disabled={busy}>가입 마치기</button>
          <button type="button" className="link" onClick={async () => { await supabase.auth.signOut(); await refresh(); }}>다른 계정으로 로그인</button>
        </form>
      )}

      <p id="msg" role="alert">{msg}</p>
    </section>
  );
}
