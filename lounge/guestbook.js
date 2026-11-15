// 방명록: 메인 페이지(index.html)와 오두막(lounge.html)이 같이 쓰는 스레드형 글 목록.
// 글 아래에 답글이 달린다. 방명록은 메인 공간과 방마다 하나씩 (supabase/002_cats_invites_guestbook.sql 의 posts 표).
export const BOARDS = { bar: '메인 공간', r1: '벽난로 방', r2: '책방', r3: '창가 방', r4: '담요 방' };

const CSS = `
.bd { display: grid; gap: 12px; text-align: left; font-size: 15px; line-height: 1.5; }
.bd form { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; width: auto; margin: 0; }
.bd textarea, .bd input, .bd select { flex: 1 1 160px; min-width: 0; padding: 9px 11px; border: 0; border-radius: 10px; background: #fff; color: #222; font: inherit; }
.bd select { flex: 0 0 auto; }
.bd textarea { resize: vertical; }
.bd-list, .bd-replies { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.bd-post { display: block; padding: 12px 14px; border-radius: 14px; background: #ffffff1c; }
.bd-replies { margin-top: 10px; padding-left: 12px; border-left: 2px solid #ffffff40; }
.bd-reply { display: block; padding: 0; background: none; border-radius: 0; }
.bd-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.bd-meta { opacity: .65; font-size: 13px; }
.bd-body { margin: 4px 0 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.bd-link { padding: 2px 4px; border: 0; background: none; color: inherit; font: inherit; font-size: 13px; font-weight: 400; text-decoration: underline; cursor: pointer; opacity: .8; }
.bd-link:hover, .bd-link:focus-visible { background: none; opacity: 1; }
.bd-msg { min-height: 1.4em; margin: 0; color: #ffd9a8; font-size: 14px; }
.bd-empty { opacity: .7; text-align: center; margin: 8px 0; }
`;

// 작은 DOM 도우미. 글 내용은 전부 텍스트 노드로 들어가므로 태그가 섞여 있어도 실행되지 않는다.
export function h(tag, props, ...children) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

export function ago(iso) {
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// el 안에 방명록을 그린다. board를 주면 그 방명록만, 안 주면 전체 글 + 어디에 쓸지 고르는 칸.
// 방명록·게시대가 같이 쓰는 스타일을 한 번만 넣는다
export function boardCss() {
  if (!document.getElementById('bd-css')) document.head.append(h('style', { id: 'bd-css', textContent: CSS }));
}

export function mountBoard(el, supabase, member, board = null) {
  boardCss();
  const open = new Set();   // 답글을 펼쳐 둔 글
  const msg = h('p', { className: 'bd-msg', role: 'alert' });
  const list = h('ol', { className: 'bd-list' });
  const pick = board ? null : h('select', { ariaLabel: '어느 방명록에 쓸지' },
    ...Object.entries(BOARDS).map(([value, textContent]) => h('option', { value, textContent })));
  const text = h('textarea', { rows: 2, maxLength: 500, required: true, placeholder: '방명록에 글 남기기…', ariaLabel: '방명록 글' });
  const form = h('form', {}, pick, text, h('button', { textContent: '올리기' }));
  el.replaceChildren(h('div', { className: 'bd' }, form, msg, list));

  // 보내는 동안 버튼을 잠그고, 실패하면 이유를 보여 준다
  async function send(button, row) {
    button.disabled = true;
    msg.textContent = '';
    const { error } = await supabase.from('posts').insert(row);
    button.disabled = false;
    if (error) msg.textContent = '올리지 못했어요: ' + error.message;
    return !error;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = text.value.trim();
    if (body && await send(form.querySelector('button'), { board: board ?? pick.value, body })) {
      text.value = '';
      reload();
    }
  });

  function entry(p, isReply) {
    const mine = p.author === member.id;
    return h('li', { className: isReply ? 'bd-post bd-reply' : 'bd-post' },
      h('div', { className: 'bd-head' },
        h('strong', { textContent: p.nickname }),
        h('span', { className: 'bd-meta', textContent: (board || isReply ? '' : BOARDS[p.board] + ' · ') + ago(p.created_at) }),
        mine && h('button', { className: 'bd-link', type: 'button', textContent: '삭제', onclick: async () => {
          const { error } = await supabase.from('posts').delete().eq('id', p.id);
          if (error) msg.textContent = '지우지 못했어요: ' + error.message;
          reload();
        } })),
      h('p', { className: 'bd-body', textContent: p.body }));
  }

  async function reload() {
    // ponytail: 최근 300개(글+답글)만 가져온다. 글이 많아지면 페이지 나누기.
    let q = supabase.from('posts').select('id, board, author, nickname, body, parent_id, created_at')
      .order('created_at', { ascending: false }).limit(300);
    if (board) q = q.eq('board', board);
    const { data, error } = await q;
    if (error) { msg.textContent = '방명록을 불러오지 못했어요: ' + error.message; return; }

    const replies = new Map();   // 글 번호 → 답글들 (오래된 것부터)
    for (const p of data) if (p.parent_id) replies.set(p.parent_id, [p, ...(replies.get(p.parent_id) ?? [])]);
    const posts = data.filter((p) => !p.parent_id);
    list.replaceChildren(...posts.map((p) => {
      const mine = replies.get(p.id) ?? [];
      const li = entry(p, false);
      const input = h('input', { maxLength: 500, required: true, placeholder: '답글 달기…', ariaLabel: '답글' });
      const replyForm = h('form', {}, input, h('button', { textContent: '답글' }));
      replyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = input.value.trim();
        if (body && await send(replyForm.querySelector('button'), { board: p.board, body, parent_id: p.id })) reload();
      });
      const thread = h('div', { hidden: !open.has(p.id) }, h('ol', { className: 'bd-replies' }, ...mine.map((r) => entry(r, true))), replyForm);
      thread.lastChild.style.marginTop = '10px';
      li.append(h('button', { className: 'bd-link', type: 'button', textContent: mine.length ? `답글 ${mine.length}개` : '답글 달기', onclick: () => {
        thread.hidden = !thread.hidden;
        if (thread.hidden) open.delete(p.id); else { open.add(p.id); input.focus(); }
      } }), thread);
      return li;
    }));
    if (!posts.length) list.append(h('li', { className: 'bd-empty', textContent: '아직 글이 없어요. 첫 글을 남겨 보세요.' }));
  }
  reload();
  return reload;
}
