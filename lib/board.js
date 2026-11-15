// 게시판 카테고리 = 취미. DB의 hobbies 표(supabase/005_hobbies_meetups.sql)와 같은 목록이어야 한다.
export const CATEGORIES = ['풋살', '농구', '러닝', '헬스', '보드게임', '더블데이트', '독서', '자유'];
// 취미 공간으로 바로 들어가는 자리 (오두막 좌표 x,z). /lounge?at= 로 넘긴다.
export const HOBBY_AT = { 풋살: '-6,17.6', 농구: '6.5,17.6', 러닝: '-3,17.5', 헬스: '9.4,4.4', 보드게임: '-9.2,-1.3', 더블데이트: '9.3,-1.5', 독서: '-9.6,4.6' };
export const CONTACT = 'samsara1019@naver.com';   // 문의·초대 코드 요청을 받는 주소 (개인정보 처리방침에도 나온다)
export const LEVELS = ['누구나', '처음이어도 됨', '해 본 사람'];
export const SIDO = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

export function ago(iso) {
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// 정지 중인 회원인지. 영구 정지는 DB가 'infinity' 로 준다.
export const isSuspended = (m) => !!m?.suspended_until && (m.suspended_until === 'infinity' || new Date(m.suspended_until) > new Date());
console.assert(isSuspended({ suspended_until: 'infinity' }) && !isSuspended({ suspended_until: null }) && !isSuspended({ suspended_until: '2000-01-01' }), 'isSuspended');

// 모임 일시: "11월 21일 (토) 오후 2:00"
export function when(iso) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
