import { AuthProvider } from '@/lib/auth';

export const metadata = { title: '레친자들', robots: { index: false, follow: false } };

// 오두막(3D)은 게시판과 스타일이 완전히 달라서 루트 레이아웃을 따로 둔다
export default function LoungeLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
