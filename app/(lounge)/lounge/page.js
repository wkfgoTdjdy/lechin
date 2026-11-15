'use client';
import { isSuspended } from '@/lib/board';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { SKELETON } from '@/lounge/skeleton';
import './lounge.css';

let started = false;   // 3D 엔진은 페이지당 한 번만 시작한다 (개발 모드에서 effect가 두 번 불려도)

// 오두막 화면. 고정 HTML을 깔고, 로그인 확인이 끝나면 3D 엔진(lounge/engine.js)을 브라우저에서만 불러와 시작한다.
export default function LoungePage() {
  const { ready, member } = useAuth();
  useEffect(() => {
    if (!ready || started) return;
    if (supabase && !member) return location.replace('/');
    if (isSuspended(member)) { alert('이용이 정지된 동안에는 오두막에 들어갈 수 없어요.'); return location.replace('/'); }   // 회원만 입장. 실제 출입문은 Supabase의 채널 접근 규칙이다.
    started = true;
    import('@/lounge/engine')
      .then(({ start }) => start({ supabase, member }))
      .catch((err) => {   // 모델·모듈을 못 불러오면 로딩 화면에 갇히지 않게 알려 준다
        console.error(err);
        const m = document.getElementById('introMsg');
        if (m) m.innerHTML = '오두막을 열지 못했어요. <a href="" style="color:inherit">다시 시도</a>';
      });
  }, [ready, member]);
  return <div dangerouslySetInnerHTML={{ __html: SKELETON }} />;
}
