import './board.css';
import { AuthProvider } from '@/lib/auth';
import Header from '@/components/Header';

export const metadata = {
  title: '레친자들',
  description: '같이 운동하고 놀 친구를 찾는 곳.',
  robots: { index: false, follow: false },   // 검색 엔진에 잡히지 않게
};

// 게시판 쪽 화면(목록·글·글쓰기·로그인)의 공통 틀
export default function BoardLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
