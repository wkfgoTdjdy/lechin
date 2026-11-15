'use client';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// 오두막의 방(web/lounge/engine.js 의 ROOMS) → 게시판 취미
const ROOM_HOBBY = { r1: '보드게임', r2: '독서', r3: '더블데이트', r4: '헬스', bar: '자유', yard: '자유', futsal: '풋살', court: '농구', track: '러닝' };

// 방별 접속 정보 → { total, 취미이름: n, ... }
export function countRooms(state) {
  const counts = { total: 0 };
  for (const metas of Object.values(state)) {
    const hobby = ROOM_HOBBY[metas.at(-1)?.room];
    counts.total += 1;
    if (hobby) counts[hobby] = (counts[hobby] ?? 0) + 1;
  }
  return counts;
}
console.assert(countRooms({ a: [{ room: 'r2' }], b: [{ room: 'bar' }], c: [{}] }).total === 3
  && countRooms({ a: [{ room: 'r2' }] })['독서'] === 1, 'countRooms');

// 채널 하나를 화면 여러 곳(머리글·취미 탭)이 같이 쓴다.
let counts = { total: 0 }, started = false;
const listeners = new Set();
// 오두막 채널에 잠깐 들어가 인원만 읽고 바로 나온다. 계속 붙어 있으면 오두막의 위치 신호를 전부 받게 되어
// 게시판을 보는 사람 수만큼 Supabase 의 초당 메시지 한도를 쓴다 (한도를 넘으면 오두막 연결이 끊긴다).
async function peek() {
  await supabase.realtime.setAuth();
  const channel = supabase.channel('lounge', { config: { private: true } });
  const leave = () => supabase.removeChannel(channel);
  channel.on('presence', { event: 'sync' }, () => {
    counts = countRooms(channel.presenceState());
    listeners.forEach((fn) => fn(counts));
    leave();
  }).subscribe();
  setTimeout(leave, 8000);   // 응답이 없어도 붙어 있지 않게
}
function start() {
  started = true;
  peek();
  setInterval(peek, 30000);   // 30초마다 다시 센다
}

// 지금 오두막에 있는 사람 수. 숫자만 세고 누가 있는지는 보지 않는다.
// ponytail: 30초마다 세기 때문에 숫자가 그만큼 늦다. 바로 보여야 하면 인원 전용 채널을 따로 만든다.
export function useRoomCounts(enabled) {
  return useSyncExternalStore(
    (onChange) => {
      if (!supabase || !enabled) return () => {};
      if (!started) start();
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => counts, () => counts);
}
