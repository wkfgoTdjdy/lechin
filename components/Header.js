'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRoomCounts } from '@/lib/presence';
import Bell from '@/components/Bell';
import { isSuspended } from '@/lib/board';

// 맨 위 줄: 이름 · 오두막 들어가기 · 내 정보
export default function Header() {
  const { member, refresh } = useAuth();
  const { total } = useRoomCounts(!!member);
  return (
    <header id="top">
      <Link className="brand" href="/">🐾 레친자들</Link>
      {/* 오두막은 루트 레이아웃이 달라서 일반 링크로 간다 (페이지를 새로 불러옴) */}
      {(member || !supabase) && <a className="btn" href="/lounge">🚪 오두막 들어가기{total > 0 && ` · ${total}명`}</a>}
      {member && (
        <span id="who">
          <Bell memberId={member.id} />
          <Link href="/me">{member.nickname}님{isSuspended(member) && ' (정지 중)'}</Link>
          {member.is_admin && <Link href="/admin">운영</Link>}
          <button type="button" className="link" onClick={async () => { await supabase.auth.signOut(); await refresh(); }}>로그아웃</button>
        </span>
      )}
    </header>
  );
}
