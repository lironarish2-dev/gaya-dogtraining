/* ============================================================
   KAHU — לוגיקת האפליקציה: ניווט, מסכים, אינטראקציות
   ============================================================ */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let currentTab = 'feed';
  let profileUserId = null;   /* מי מוצג במסך הפרופיל */
  let crmClientId = null;     /* לקוח פתוח ב-CRM */

  /* ---------- רכיבי עזר ---------- */
  function avatarHTML(user, cls = '') {
    if (user.img) return `<span class="avatar ${cls}"><img src="${user.img}" alt=""></span>`;
    return `<span class="avatar ${cls}" style="background:${KDB.avatarColor(user.id)}">${esc(KDB.initials(user.name))}</span>`;
  }
  function mediaHTML(m) {
    if (m.type === 'img') return `<img src="${m.src}" alt="" loading="lazy">`;
    return `<div class="post-media-ph" style="background:linear-gradient(135deg,${m.grad[0]},${m.grad[1]})">${m.emoji}<small>${esc(m.label)}</small></div>`;
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------- גיליון תחתון ---------- */
  const sheet = $('#sheet'), backdrop = $('#sheet-backdrop'), sheetC = $('#sheet-content');
  function openSheet(html) {
    sheetC.innerHTML = html;
    sheet.hidden = backdrop.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('in'); backdrop.classList.add('in'); });
  }
  function closeSheet() {
    sheet.classList.remove('in'); backdrop.classList.remove('in');
    setTimeout(() => { sheet.hidden = backdrop.hidden = true; sheetC.innerHTML = ''; }, 280);
  }
  backdrop.addEventListener('click', closeSheet);

  /* ============================================================
     פיד
     ============================================================ */
  function renderFeed() {
    const db = KDB.db;
    const stories = db.users.filter(u => u.name).map(u => `
      <button class="story" data-profile="${u.id}" aria-label="הפרופיל של ${esc(u.name)}">
        ${avatarHTML(u, 'avatar-lg avatar-ring')}
        <span class="story-name">${esc(u.name.split(' ')[0])}</span>
      </button>`).join('');

    const posts = db.posts.map(p => {
      const u = KDB.user(p.userId);
      const liked = p.likes.includes(db.currentUserId);
      const lastC = p.comments[p.comments.length - 1];
      return `
      <article class="card post">
        <div class="post-head">
          <button data-profile="${u.id}" aria-label="הפרופיל של ${esc(u.name)}">${avatarHTML(u)}</button>
          <div class="post-head-names">
            <div class="post-author">${esc(u.name)} ${u.role === 'trainer' ? '<span class="chip" style="font-size:.68rem">מאלפת ✦</span>' : ''}</div>
            <div class="post-meta">${esc(u.dog)} · ${esc(p.ts)}</div>
          </div>
        </div>
        <div class="post-media">
          ${mediaHTML(p.media)}
          <span class="chip post-tag-on-media">${esc(p.tag)}</span>
        </div>
        <div class="post-actions">
          <button class="act-btn ${liked ? 'liked' : ''}" data-like="${p.id}" aria-label="לייק">
            ${liked ? '❤️' : '🤍'} <span class="act-count">${p.likes.length}</span>
          </button>
          <button class="act-btn" data-comments="${p.id}" aria-label="תגובות">💬 <span class="act-count">${p.comments.length}</span></button>
        </div>
        <div class="post-caption"><b>${esc(u.name.split(' ')[0])}</b> ${esc(p.caption)}</div>
        ${lastC ? `<button class="post-comments-link" data-comments="${p.id}">
            <b>${esc(KDB.user(lastC.userId).name.split(' ')[0])}:</b> ${esc(lastC.text.slice(0, 60))}${lastC.text.length > 60 ? '…' : ''} · לכל התגובות
          </button>` : ''}
      </article>`;
    }).join('');

    view.innerHTML = `
      <div class="stories">${stories}</div>
      ${posts}`;
  }

  /* ============================================================
     קהילה
     ============================================================ */
  function renderCommunity() {
    const db = KDB.db;
    const isTrainer = KDB.me().role === 'trainer';
    const members = db.users.filter(u => u.name).map(u => `
      <button class="card member-card" data-profile="${u.id}">
        ${avatarHTML(u, 'avatar-lg')}
        <span class="member-name">${esc(u.name)}</span>
        <span class="member-dog">🐕 ${esc(u.dog)}${u.breed ? ' · ' + esc(u.breed) : ''}</span>
        ${u.role === 'trainer' ? '<span class="chip">מאלפת ✦</span>' : `<span class="chip chip-sand">${esc(u.joined)}</span>`}
      </button>`).join('');

    view.innerHTML = `
      <div class="invite-card">
        <div style="font-weight:800">🔑 הקהילה של דרך הקאהו</div>
        <div class="code">GAYA2026</div>
        <p>${isTrainer
          ? 'זה הקוד האישי שלך. שתפי אותו עם לקוחות חדשים — רק מי שמקבל אותו ממך נכנס לקהילה.'
          : 'קהילה סגורה: כל מי שכאן הוזמן אישית עם קוד. מרחב בטוח, מוכר ותומך.'}</p>
        ${isTrainer ? '<button class="btn btn-sm" style="background:#fff;color:var(--honey-dk)" id="share-code">שיתוף הקוד 📤</button>' : ''}
      </div>
      <div class="section-pad h-row"><h2 class="h2">חברי הקהילה</h2><span class="muted">${db.users.filter(u => u.name).length} חברים</span></div>
      <div class="members">${members}</div>`;

    $('#share-code')?.addEventListener('click', () => toast('הקוד הועתק — אפשר לשלוח ללקוח 🎉'));
  }

  /* ============================================================
     פרופיל — אותו מסך בדיוק לבעל הפרופיל ולכל צופה
     ============================================================ */
  function renderProfile(userId) {
    const u = KDB.user(userId);
    const posts = KDB.postsBy(userId);
    const isMe = userId === KDB.db.currentUserId;
    const likeCount = KDB.db.posts.filter(p => p.likes.includes(userId)).length;

    const grid = posts.length ? posts.map(p => `
      <button class="pgrid-item" data-comments="${p.id}" aria-label="פוסט">
        ${p.media.type === 'img'
          ? `<img src="${p.media.src}" alt="" loading="lazy">`
          : `<div class="pgrid-ph" style="background:linear-gradient(135deg,${p.media.grad[0]},${p.media.grad[1]})">${p.media.emoji}</div>`}
      </button>`).join('')
      : '';

    view.innerHTML = `
      ${!isMe ? `<button class="back-btn" id="profile-back">→ חזרה</button>` : ''}
      <div class="profile-cover"></div>
      <div class="profile-head">
        ${avatarHTML(u, 'avatar-lg avatar-ring')}
        <div>
          <div class="profile-name">${esc(u.name)} ${u.role === 'trainer' ? '<span class="chip">מאלפת ✦</span>' : ''}</div>
          <div class="profile-sub">🐕 ${esc(u.dog)}${u.breed ? ' · ' + esc(u.breed) : ''} · ${esc(u.joined)}</div>
        </div>
        ${u.bio ? `<p class="profile-bio">${esc(u.bio)}</p>` : ''}
      </div>
      ${isMe ? `<div class="same-view-note">👁️ כך בדיוק נראה הפרופיל שלך לכל חבר קהילה שנכנס אליו — מה שאת/ה רואה, כולם רואים.</div>` : ''}
      <div class="card profile-stats">
        <div class="pstat"><b>${posts.length}</b><span>שיתופים</span></div>
        <div class="pstat"><b>${likeCount}</b><span>לייקים שקיבל/ה</span></div>
        <div class="pstat"><b>${u.role === 'trainer' ? KDB.db.clients.length : (KDB.client(userId)?.progress ?? 0) + '%'}</b><span>${u.role === 'trainer' ? 'לקוחות בליווי' : 'התקדמות במסלול'}</span></div>
      </div>
      ${posts.length
        ? `<div class="profile-grid">${grid}</div>`
        : `<div class="empty"><span class="e-emoji">📷</span><b>עוד אין שיתופים</b><span>הרגע הראשון עם ${esc(u.dog || 'הכלב')} מחכה להיות מונצח</span></div>`}
    `;
    $('#profile-back')?.addEventListener('click', () => { profileUserId = null; render(); });
  }

  /* ============================================================
     המסלול שלי (בעל כלב)
     ============================================================ */
  function renderJourney() {
    const me = KDB.me();
    const c = KDB.client(KDB.db.currentUserId) || {
      plan: 'מסלול הקאהו · 12 מפגשים', progress: 8, goals: 'נקבעים יחד במפגש הראשון',
      homework: [{ id: 'h0', title: 'להכיר את הקהילה', desc: 'להציץ בפיד ולומר שלום 👋', done: false }],
      sessions: [{ date: 'בקרוב', topic: 'מפגש היכרות עם גאיה', sum: 'נתאם יחד את היעדים שלכם' }],
    };
    const doneCount = c.homework.filter(h => h.done).length;

    const badges = [
      { e: '🐾', n: 'צעד ראשון', locked: false },
      { e: '📸', n: 'שיתוף ראשון', locked: KDB.postsBy(KDB.db.currentUserId).length === 0 },
      { e: '🔥', n: 'שבוע רצוף', locked: c.progress < 30 },
      { e: '🎯', n: 'חצי דרך', locked: c.progress < 50 },
      { e: '🏆', n: 'בוגרי הקאהו', locked: c.progress < 100 },
    ].map(b => `<div class="card badge-card ${b.locked ? 'locked' : ''}"><span class="b-emoji">${b.e}</span><span class="b-name">${b.n}</span></div>`).join('');

    view.innerHTML = `
      <div class="section-pad"><h2 class="h2">המסלול של ${esc(me.dog || 'הכלב שלך')} 🧭</h2>
      <p class="muted">${esc(c.plan)}</p></div>

      <div class="card progress-hero">
        <div class="h-row"><b>ההתקדמות שלכם</b><span class="chip">${c.progress}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${c.progress}%"></div></div>
        <p class="muted">🎯 היעדים: ${esc(c.goals)}</p>
      </div>

      <div class="section-pad h-row"><h3 class="h3">שיעורי בית מגאיה</h3><span class="muted">${doneCount}/${c.homework.length} הושלמו</span></div>
      <div class="card" style="margin:0 1.1rem">
        ${c.homework.map(h => `
          <button class="hw-item ${h.done ? 'done' : ''}" data-hw="${h.id}" style="width:100%;text-align:start">
            <span class="hw-check">${h.done ? '✓' : ''}</span>
            <span><span class="hw-title">${esc(h.title)}</span><br><span class="hw-desc">${esc(h.desc)}</span></span>
          </button>`).join('')}
      </div>

      <div class="section-pad"><h3 class="h3">ההישגים שלכם</h3></div>
      <div class="badges">${badges}</div>

      <div class="section-pad"><h3 class="h3">מפגשים אחרונים</h3></div>
      <div class="card" style="margin:0 1.1rem 1rem">
        ${c.sessions.map(s => `<div class="session-item">
          <div class="session-date">${esc(s.date)}</div>
          <div class="session-topic">${esc(s.topic)}</div>
          <div class="session-sum">${esc(s.sum)}</div></div>`).join('')}
      </div>`;

    $$('[data-hw]', view).forEach(b => b.addEventListener('click', () => {
      KDB.toggleHomework(KDB.db.currentUserId, b.dataset.hw);
      render();
      toast('כל הכבוד! העדכון נשלח לגאיה אוטומטית ✅');
    }));
  }

  /* ============================================================
     CRM (מאלפת) — רשימת לקוחות
     ============================================================ */
  function renderCRM() {
    if (crmClientId) return renderClientDetail(crmClientId);
    const db = KDB.db;
    const active = db.clients.filter(c => !c.risk).length;
    const risky = db.clients.filter(c => c.risk).length;

    const rows = db.clients.map(c => {
      const u = KDB.user(c.userId);
      return `
      <button class="client-row" data-client="${c.userId}">
        ${avatarHTML(u)}
        <span class="client-info">
          <span class="client-name">${esc(u.name)} ${c.risk ? '<span class="chip chip-red" style="font-size:.68rem">דורש קשר</span>' : ''}</span><br>
          <span class="client-meta">🐕 ${esc(u.dog)} · ${esc(c.plan)}</span><br>
          <span class="client-meta">פעילות אחרונה: ${esc(c.lastActive)}</span>
        </span>
        <span class="client-prog">
          <span class="mini-track"><span class="mini-fill" style="width:${c.progress}%;display:block"></span></span>
          <span>${c.progress}%</span>
        </span>
      </button>`;
    }).join('');

    view.innerHTML = `
      <div class="section-pad"><h2 class="h2">ניהול לקוחות 📋</h2>
      <p class="muted">המערכת עוקבת אחרי הפעילות של כל לקוח ומעדכנת אותך אוטומטית.</p></div>

      <div class="crm-stats">
        <div class="card crm-stat"><b>${db.clients.length}</b><span>לקוחות בליווי</span></div>
        <div class="card crm-stat"><b>${active}</b><span>פעילים השבוע</span></div>
        <div class="card crm-stat"><b style="color:var(--red)">${risky}</b><span>דורשים קשר</span></div>
      </div>

      <div class="section-pad h-row"><h3 class="h3">עדכונים אוטומטיים</h3><span class="chip chip-green">חי ●</span></div>
      <div class="card" style="margin:0 1.1rem">
        ${db.activityLog.slice(0, 4).map(a => `
          <div class="alert-row"><span class="alert-ico">${a.ico}</span>
          <span><span class="alert-txt">${a.text}</span><br><span class="alert-time">${esc(a.time)}</span></span></div>`).join('')}
      </div>

      <div class="section-pad h-row"><h3 class="h3">הלקוחות שלי</h3></div>
      <div class="card" style="margin:0 1.1rem 1rem">${rows}</div>`;

    $$('[data-client]', view).forEach(b => b.addEventListener('click', () => {
      crmClientId = b.dataset.client; render();
    }));
  }

  /* ---------- פירוט לקוח ---------- */
  let clientTab = 'overview';
  function renderClientDetail(userId) {
    const c = KDB.client(userId), u = KDB.user(userId);
    const doneCount = c.homework.filter(h => h.done).length;

    let body = '';
    if (clientTab === 'overview') {
      body = `
        <div class="card progress-hero" style="margin-top:0">
          <div class="h-row"><b>התקדמות במסלול</b><span class="chip">${c.progress}%</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${c.progress}%"></div></div>
          <p class="muted">🎯 ${esc(c.goals)}</p>
        </div>
        <div class="section-pad h-row" style="padding-inline:0"><h3 class="h3">מפגשים</h3></div>
        <div class="card">${c.sessions.map(s => `<div class="session-item">
          <div class="session-date">${esc(s.date)}</div>
          <div class="session-topic">${esc(s.topic)}</div>
          <div class="session-sum">${esc(s.sum)}</div></div>`).join('')}
        </div>`;
    } else if (clientTab === 'homework') {
      body = `
        <div class="card">
          ${c.homework.map(h => `
            <div class="hw-item ${h.done ? 'done' : ''}">
              <span class="hw-check">${h.done ? '✓' : ''}</span>
              <span><span class="hw-title">${esc(h.title)}</span><br><span class="hw-desc">${esc(h.desc)}</span></span>
            </div>`).join('')}
        </div>
        <div class="card" style="margin-top:1rem;padding:1rem">
          <b>שיעור בית חדש</b>
          <input class="input" id="hw-new-title" placeholder="כותרת — לדוגמה: תרגול רצועה רפויה" style="margin:.6rem 0">
          <input class="input" id="hw-new-desc" placeholder="הנחיות קצרות ללקוח">
          <button class="btn btn-primary btn-block" id="hw-add" style="margin-top:.8rem">שליחה ללקוח 📤</button>
        </div>`;
    } else {
      body = `
        <div class="card" style="padding:1rem">
          <b>הערות פנימיות (רק את רואה אותן)</b>
          <textarea class="input" id="note-text" style="margin-top:.6rem">${esc(c.notes)}</textarea>
          <button class="btn btn-primary btn-block" id="note-save" style="margin-top:.8rem">שמירת הערות</button>
        </div>`;
    }

    view.innerHTML = `
      <button class="back-btn" id="crm-back">→ כל הלקוחות</button>
      <div class="detail-head">
        ${avatarHTML(u, 'avatar-lg')}
        <div>
          <div class="profile-name" style="font-size:1.25rem">${esc(u.name)}</div>
          <div class="muted">🐕 ${esc(u.dog)} · ${esc(c.plan)}</div>
          <div class="muted">שיעורי בית: ${doneCount}/${c.homework.length} · פעילות: ${esc(c.lastActive)}</div>
        </div>
      </div>
      <div class="seg" role="tablist">
        <button role="tab" data-ctab="overview" class="${clientTab === 'overview' ? 'active' : ''}">סקירה</button>
        <button role="tab" data-ctab="homework" class="${clientTab === 'homework' ? 'active' : ''}">שיעורי בית</button>
        <button role="tab" data-ctab="notes" class="${clientTab === 'notes' ? 'active' : ''}">הערות</button>
      </div>
      <div style="padding:0 1.1rem 1rem">${body}</div>`;

    $('#crm-back').addEventListener('click', () => { crmClientId = null; clientTab = 'overview'; render(); });
    $$('[data-ctab]', view).forEach(b => b.addEventListener('click', () => { clientTab = b.dataset.ctab; render(); }));
    $('#hw-add')?.addEventListener('click', () => {
      const t = $('#hw-new-title').value, d = $('#hw-new-desc').value;
      if (!t.trim()) return toast('צריך כותרת לשיעור הבית');
      KDB.addHomework(userId, t, d);
      render(); toast(`שיעור הבית נשלח ל${esc(u.name.split(' ')[0])} 📤`);
    });
    $('#note-save')?.addEventListener('click', () => {
      KDB.saveNote(userId, $('#note-text').value);
      toast('ההערות נשמרו 🔒');
    });
  }

  /* ============================================================
     שיתוף חדש
     ============================================================ */
  let composeSel = { media: 0, tag: 'התקדמות' };
  const MEDIA_OPTS = [
    { type: 'ph', emoji: '🦮', grad: ['#C05621', '#E2A25B'], label: 'רגע מהטיול' },
    { type: 'ph', emoji: '🐕', grad: ['#2F855A', '#79C99E'], label: 'אימון בבית' },
    { type: 'ph', emoji: '🎾', grad: ['#2B6CB0', '#7EB2E6'], label: 'משחק' },
    { type: 'ph', emoji: '😴', grad: ['#6B46C1', '#B79CE8'], label: 'רגיעה' },
    { type: 'ph', emoji: '🏆', grad: ['#975A16', '#E2B25B'], label: 'הישג' },
    { type: 'ph', emoji: '❤️', grad: ['#B83280', '#E88BB8'], label: 'רגע ביחד' },
  ];
  const TAGS = ['התקדמות', 'פריצת דרך', 'שאלה לקהילה', 'רגע מתוק', 'אתגר'];

  function renderCompose() {
    view.innerHTML = `
      <div class="compose-pad">
        <h2 class="h2">שיתוף עם הקהילה 📸</h2>
        <p class="muted">באפליקציה המלאה תצלמו או תבחרו מהגלריה. בדמו — בוחרים רקע:</p>
        <div class="compose-media-pick">
          ${MEDIA_OPTS.map((m, i) => `
            <button class="cm-opt ${composeSel.media === i ? 'sel' : ''}" data-media="${i}" aria-label="${esc(m.label)}">
              <span class="ph" style="background:linear-gradient(135deg,${m.grad[0]},${m.grad[1]})">${m.emoji}</span>
            </button>`).join('')}
        </div>
        <div>
          <b style="font-size:.9rem">מה מתאים לרגע?</b>
          <div class="tag-row" style="margin-top:.5rem">
            ${TAGS.map(t => `<button class="tag-pick ${composeSel.tag === t ? 'sel' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>
        </div>
        <textarea class="input" id="compose-text" placeholder="ספרו לקהילה מה קרה היום… מה עבד? מה היה קשה? כל צעד שווה שיתוף 🧡"></textarea>
        <button class="btn btn-primary btn-block" id="compose-post">פרסום בקהילה</button>
      </div>`;

    $$('[data-media]', view).forEach(b => b.addEventListener('click', () => { composeSel.media = +b.dataset.media; renderCompose(); }));
    $$('[data-tag]', view).forEach(b => b.addEventListener('click', () => { composeSel.tag = b.dataset.tag; renderCompose(); }));
    $('#compose-post').addEventListener('click', () => {
      const text = $('#compose-text').value;
      if (!text.trim()) return toast('כתבו כמה מילים על הרגע 🙂');
      const m = MEDIA_OPTS[composeSel.media];
      KDB.addPost({ caption: text, tag: composeSel.tag, media: { ...m } });
      currentTab = 'feed'; render();
      toast('שותף עם הקהילה! גאיה קיבלה עדכון 🎉');
    });
  }

  /* ============================================================
     גיליונות: תגובות, התראות, הגדרות
     ============================================================ */
  function openComments(postId) {
    const p = KDB.db.posts.find(x => x.id === postId);
    const u = KDB.user(p.userId);
    openSheet(`
      <div class="sheet-title">תגובות · ${esc(u.name.split(' ')[0])} ו${esc(u.dog)}</div>
      <div id="c-list">
        ${p.comments.length ? p.comments.map(c => {
          const cu = KDB.user(c.userId);
          return `<div class="comment">${avatarHTML(cu, 'avatar-sm')}<div class="comment-body"><b>${esc(cu.name)}</b>${esc(c.text)}</div></div>`;
        }).join('') : '<div class="empty" style="padding:1.5rem"><span class="e-emoji">💬</span>עוד אין תגובות — תהיו ראשונים</div>'}
      </div>
      <div class="comment-form">
        <input class="input" id="c-new" placeholder="מילה טובה, שאלה, עידוד…" aria-label="תגובה חדשה">
        <button class="btn btn-primary btn-sm" id="c-send">שליחה</button>
      </div>`);
    $('#c-send').addEventListener('click', () => {
      const t = $('#c-new').value;
      if (!t.trim()) return;
      KDB.addComment(postId, t);
      closeSheet(); render(); toast('התגובה פורסמה 💬');
    });
  }

  function openNotifs() {
    $('#notif-dot').hidden = true;
    KDB.db.notifications.forEach(n => n.unread = false); KDB.save();
    openSheet(`
      <div class="sheet-title">התראות 🔔</div>
      ${KDB.db.notifications.map(n => `
        <div class="notif-row"><span class="alert-ico">${n.ico}</span>
        <span class="notif-txt">${esc(n.text)}<br><span class="notif-time">${esc(n.time)}</span></span></div>`).join('')}`);
  }

  function openSettings() {
    const db = KDB.db;
    const me = KDB.me();
    openSheet(`
      <div class="sheet-title">הגדרות ⚙️</div>
      <button class="settings-row" id="s-role">
        <span><span class="s-title">תצוגת תפקיד</span><br><span class="s-sub">כרגע: ${me.role === 'trainer' ? 'מאלף/ת (עם CRM)' : 'בעל/ת כלב (עם המסלול)'} — לחיצה מחליפה</span></span>
        <span class="chip">${me.role === 'trainer' ? '🎓' : '🦮'}</span>
      </button>
      <button class="settings-row" id="s-font">
        <span><span class="s-title">טקסט מוגדל</span><br><span class="s-sub">נגישות — הגדלת כל הטקסטים באפליקציה</span></span>
        <span class="switch ${db.fontLarge ? 'on' : ''}" id="s-font-sw"></span>
      </button>
      <button class="settings-row" id="s-notif">
        <span><span class="s-title">התראות</span><br><span class="s-sub">עדכונים על תגובות, לייקים ושיעורי בית</span></span>
        <span class="switch ${db.notifsOn ? 'on' : ''}" id="s-notif-sw"></span>
      </button>
      <button class="settings-row" id="s-reset">
        <span><span class="s-title">איפוס הדמו</span><br><span class="s-sub">חזרה למסך הפתיחה ולנתוני ההתחלה</span></span>
        <span>↺</span>
      </button>
      <div class="pro-card">
        <h4>KAHU Pro למאלפים ✦</h4>
        <p>לקוחות ללא הגבלה, תוכניות אימון מוכנות, דוחות התקדמות ללקוח ותזכורות אוטומטיות.</p>
        <button class="btn btn-sm" style="background:var(--honey);color:#fff" id="s-pro">בקרוב — הצטרפות לרשימת ההמתנה</button>
      </div>`);

    $('#s-role').addEventListener('click', () => {
      me.role = me.role === 'trainer' ? 'owner' : 'trainer';
      KDB.save(); closeSheet(); applyRoleTab(); currentTab = 'feed'; render();
      toast(me.role === 'trainer' ? 'עברת לתצוגת מאלף/ת 🎓' : 'עברת לתצוגת בעל/ת כלב 🦮');
    });
    $('#s-font').addEventListener('click', () => {
      db.fontLarge = !db.fontLarge; KDB.save(); applyFont();
      $('#s-font-sw').classList.toggle('on', db.fontLarge);
    });
    $('#s-notif').addEventListener('click', () => {
      db.notifsOn = !db.notifsOn; KDB.save();
      $('#s-notif-sw').classList.toggle('on', db.notifsOn);
    });
    $('#s-reset').addEventListener('click', () => { KDB.reset(); location.reload(); });
    $('#s-pro').addEventListener('click', () => toast('נרשמת לרשימת ההמתנה של Pro ✦'));
  }

  /* ============================================================
     ניווט וראוטינג
     ============================================================ */
  function applyFont() {
    document.documentElement.dataset.fontsize = KDB.db.fontLarge ? 'large' : 'normal';
  }
  function applyRoleTab() {
    const isTrainer = KDB.me().role === 'trainer';
    const tab = $('#tab-role');
    tab.dataset.tab = isTrainer ? 'crm' : 'journey';
    tab.querySelector('.tab-ico').textContent = isTrainer ? '📋' : '🧭';
    tab.querySelector('.tab-txt').textContent = isTrainer ? 'לקוחות' : 'המסלול';
  }

  function render() {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
    if (profileUserId && currentTab === 'profile-other') return renderProfile(profileUserId);
    switch (currentTab) {
      case 'feed': renderFeed(); break;
      case 'community': renderCommunity(); break;
      case 'compose': renderCompose(); break;
      case 'journey': renderJourney(); break;
      case 'crm': renderCRM(); break;
      case 'profile': renderProfile(KDB.db.currentUserId); break;
      default: renderFeed();
    }
    view.scrollTop = 0; window.scrollTo(0, 0);
  }

  /* אירועים גלובליים בתוך ה-view (הענקת אירועים) */
  view.addEventListener('click', e => {
    const like = e.target.closest('[data-like]');
    if (like) {
      const nowLiked = KDB.toggleLike(like.dataset.like);
      render();
      if (nowLiked) toast('🧡');
      return;
    }
    const cm = e.target.closest('[data-comments]');
    if (cm) return openComments(cm.dataset.comments);
    const pr = e.target.closest('[data-profile]');
    if (pr) {
      profileUserId = pr.dataset.profile;
      if (profileUserId === KDB.db.currentUserId) { currentTab = 'profile'; profileUserId = null; }
      else currentTab = 'profile-other';
      render();
    }
  });

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    currentTab = t.dataset.tab; profileUserId = null; crmClientId = null;
    render();
  }));
  $('#btn-notifs').addEventListener('click', openNotifs);
  $('#btn-settings').addEventListener('click', openSettings);

  /* ============================================================
     אונבורדינג
     ============================================================ */
  function initOnboarding() {
    const ob = $('#onboarding');
    ob.hidden = false;
    let step = 1, role = null;

    const show = n => {
      step = n;
      $$('.ob-step', ob).forEach(s => s.hidden = +s.dataset.step !== n);
      ob.scrollTop = 0;
    };

    $$('.role-card', ob).forEach(c => c.addEventListener('click', () => {
      role = c.dataset.role;
      $$('.role-card', ob).forEach(x => x.setAttribute('aria-pressed', x === c ? 'true' : 'false'));
      $('#ob-role-next').disabled = false;
    }));

    $$('[data-next]', ob).forEach(b => b.addEventListener('click', () => {
      if (b.id === 'ob-code-next') {
        const code = $('#ob-code').value.trim().toUpperCase();
        const hint = $('#ob-code-hint');
        if (code !== 'GAYA2026') {
          hint.textContent = 'הקוד לא מזוהה — בדמו הקוד הוא GAYA2026';
          hint.classList.add('err');
          return;
        }
      }
      show(step + 1);
    }));

    $('#ob-finish').addEventListener('click', () => {
      const me = KDB.me();
      me.name = $('#ob-name').value.trim() || 'חבר/ת קהילה';
      me.dog = $('#ob-dog').value.trim() || 'הכלב שלי';
      me.breed = $('#ob-breed').value.trim();
      me.role = role || 'owner';
      me.bio = me.role === 'trainer' ? 'מאלף/ת בקהילת KAHU' : `${me.dog} ואני במסלול הקאהו 🐾`;
      KDB.db.onboarded = true;
      if (me.role === 'owner') KDB.enrollAsClient(me.id);
      KDB.save();
      ob.hidden = true;
      startApp();
    });

    show(1);
  }

  /* ============================================================
     הפעלה
     ============================================================ */
  function startApp() {
    $('#app').hidden = false;
    applyFont(); applyRoleTab();
    if (KDB.db.notifications.some(n => n.unread)) $('#notif-dot').hidden = false;
    currentTab = 'feed';
    render();
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      $('#splash').classList.add('out');
      setTimeout(() => { $('#splash').hidden = true; }, 500);
      if (KDB.db.onboarded) startApp();
      else initOnboarding();
    }, 900);
  });
})();
