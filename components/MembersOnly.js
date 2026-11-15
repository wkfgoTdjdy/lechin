'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

// 회원이 아니면 첫 화면(로그인)으로 돌려보낸다. 안내일 뿐이고, 실제로 글을 막는 건 DB의 접근 규칙이다.
export default function MembersOnly({ children }) {
  const { ready, member } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !member) router.replace('/'); }, [ready, member, router]);
  return member ? children : null;
}
