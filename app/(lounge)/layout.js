import { AuthProvider } from '@/lib/auth';

export const metadata = { title: '레친자들', robots: { index: false, follow: false } };
// 입력칸을 누를 때 휴대폰이 화면을 저절로 확대하지 않게 한다 (확대되면 3D 화면 크기가 어긋나 오른쪽·아래에 빈 띠가 생긴다)
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false };

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
