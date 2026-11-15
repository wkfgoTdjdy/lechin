'use client';
import { Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import Landing from '@/components/Landing';
import BoardList from '@/components/BoardList';

// 첫 화면: 회원에게는 게시판, 아니면 소개와 로그인
export default function Home() {
  const { ready, member } = useAuth();
  if (!ready) return <p className="empty">불러오는 중…</p>;
  if (!member) return <Landing />;
  return <Suspense fallback={null}><BoardList /></Suspense>;
}
