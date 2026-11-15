'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

// 로그인 상태를 모든 화면이 같이 쓴다.
//   ready   처음 확인이 끝났는지
//   session 로그인했는지
//   member  초대 코드로 가입까지 마친 회원의 프로필 { id, nickname, cat, ... } (아니면 null)
//   blocked 내가 차단한 회원 Map(id → 닉네임)
//   refresh 로그인·가입·로그아웃 뒤에 다시 확인
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, session: null, member: null, blocked: new Map() });
  const refresh = useCallback(async () => {
    if (!supabase) return setState({ ready: true, session: null, member: null, blocked: new Map() });
    const { data: { session } } = await supabase.auth.getSession();
    const member = session
      ? (await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()).data
      : null;
    // 차단 표가 아직 없으면(006 실행 전) 빈 목록으로 둔다
    const blocks = member ? (await supabase.from('blocks').select('blocked, nickname')).data ?? [] : [];
    setState({ ready: true, session, member, blocked: new Map(blocks.map((b) => [b.blocked, b.nickname])) });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <AuthContext.Provider value={{ ...state, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
