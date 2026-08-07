/* ============================================================
   KAHU — שכבת נתונים
   נתוני דמו + שמירה מקומית (localStorage). בנוי כך שבהמשך
   מחליפים את המימוש בקריאות שרת בלי לגעת בממשק.
   ============================================================ */
(function () {
  const DB_KEY = 'kahu_db_v1';

  /* צבעי אווטאר לפי מזהה — עקבי לכל הצופים */
  const AVATAR_COLORS = ['#C05621', '#2F855A', '#6B46C1', '#2B6CB0', '#B83280', '#975A16', '#285E61'];

  const seed = () => ({
    onboarded: false,
    currentUserId: 'me',
    fontLarge: false,
    notifsOn: true,

    users: [
      { id: 'me',    role: 'owner',   name: '', dog: '', breed: '', bio: '', img: null, joined: 'עכשיו' },
      { id: 'gaya',  role: 'trainer', name: 'גאיה דניאל', dog: 'נובה', breed: 'רועה בלגי', bio: 'מאלפת בדרך הקאהו 🐾 חיבור · איזון · שפה משותפת. מלווה אתכם ואת הכלב — צעד אחר צעד.', img: 'images/gaya-hero.jpg', joined: 'מנהלת הקהילה' },
      { id: 'lihi',  role: 'owner',   name: 'ליהיא ברק', dog: 'לונה', breed: 'בורדר קולי', bio: 'לונה ואני בדרך לשקט בטיולים 🌿', img: null, joined: 'לפני 3 חודשים' },
      { id: 'omri',  role: 'owner',   name: 'עמרי שגב', dog: 'צ׳יקו', breed: 'מעורב', bio: 'צ׳יקו מהפנסיון לחיים חדשים ❤️', img: null, joined: 'לפני חודשיים' },
      { id: 'noa',   role: 'owner',   name: 'נועה פרידמן', dog: 'במבה', breed: 'גולדן רטריבר', bio: 'במבה בת שנה — עובדות על ריכוז ליד גירויים', img: null, joined: 'לפני 3 שבועות' },
      { id: 'tomer', role: 'owner',   name: 'תומר אלוני', dog: 'רקס', breed: 'רועה גרמני', bio: 'רקס ואני — מנפרד לשקט מלא בבית', img: null, joined: 'לפני שבוע' },
    ],

    posts: [
      { id: 'p1', userId: 'lihi', ts: 'לפני שעתיים', tag: 'פריצת דרך', media: { type: 'ph', emoji: '🦮', grad: ['#C05621', '#E2A25B'], label: 'טיול בוקר רגוע' },
        caption: 'שבועיים של עבודה על "רגליים שקטות" — והבוקר לונה עברה ליד שלושה כלבים בלי משיכה אחת ברצועה. כמעט בכיתי 🥹',
        likes: ['gaya', 'omri', 'noa'], comments: [
          { userId: 'gaya', text: 'ליהיא, זה בדיוק הרגע שעבדנו בשבילו! שימי לב שגם קצב הנשימה שלה השתנה 👏' },
          { userId: 'noa', text: 'איזו השראה! אצלנו זה עוד בתהליך 🙏' } ] },
      { id: 'p2', userId: 'gaya', ts: 'לפני 5 שעות', tag: 'טיפ מהמאלפת', media: { type: 'img', src: 'images/kahu-poster.jpg' },
        caption: 'תזכורת קטנה מהשטח: הרצועה משדרת הכול. יד רפויה = כלב רגוע. השבוע כולם מתאמנים על "יד של מים" 💧 מחכה לראות סרטונים בפיד!',
        likes: ['lihi', 'omri', 'noa', 'tomer'], comments: [
          { userId: 'omri', text: 'מנסים כבר הערב בטיול 🙌' } ] },
      { id: 'p3', userId: 'omri', ts: 'אתמול', tag: 'התקדמות', media: { type: 'ph', emoji: '🐕', grad: ['#2F855A', '#79C99E'], label: 'צ׳יקו נשאר לבד' },
        caption: 'צ׳יקו נשאר לבד 40 דקות בלי יבבה אחת. לפני חודשיים זה היה בלתי אפשרי. תודה גאיה על התוכנית המדורגת 🧡',
        likes: ['gaya', 'lihi'], comments: [
          { userId: 'gaya', text: 'עמרי — 40 דקות זה אבן דרך אמיתית. השבוע עולים ל־55 לפי התוכנית 💪' } ] },
      { id: 'p4', userId: 'noa', ts: 'לפני יומיים', tag: 'שאלה לקהילה', media: { type: 'ph', emoji: '🎾', grad: ['#2B6CB0', '#7EB2E6'], label: 'משחק או גירוי?' },
        caption: 'במבה משתגעת כשהיא רואה כדור — זה טוב לאימון או שזה מפריע לריכוז? אשמח לשמוע מה עבד לכם 🙏',
        likes: ['tomer'], comments: [
          { userId: 'gaya', text: 'שאלה מצוינת! כדור הוא מנוע מוטיבציה — נלמד לעבוד איתו ולא נגדו. ניגע בזה במפגש הבא 🎯' },
          { userId: 'lihi', text: 'אצל לונה הכדור הפך לפרס במקום להסחה — שינה הכול' } ] },
      { id: 'p5', userId: 'gaya', ts: 'לפני 3 ימים', tag: 'מהפודקאסט', media: { type: 'img', src: 'images/podcast-cover.jpg' },
        caption: 'פרק חדש ב"משני הצדדים של הרצועה" 🎧 — למה כלב "עקשן" הוא בדרך כלל כלב שלא הבינו. מחכה לשמוע מה לקחתם מהפרק.',
        likes: ['lihi', 'noa'], comments: [] },
    ],

    /* CRM של המאלפת — לכל לקוח: התקדמות, פעילות, שיעורי בית, מפגשים, הערות */
    clients: [
      { userId: 'lihi', plan: 'מסלול הקאהו · 12 מפגשים', progress: 72, lastActive: 'היום', risk: false,
        goals: 'הליכה רפויה ליד גירויים; הרגעה עצמית בבית',
        homework: [
          { id: 'h1', title: 'יד של מים — 10 דק׳ ביום', desc: 'רצועה רפויה בטיול הבוקר', done: true },
          { id: 'h2', title: 'מזרן רוגע בסלון', desc: '2 תרגולים של "מקום" עם הסחות', done: true },
          { id: 'h3', title: 'מפגש מבוקר עם כלב זר', desc: 'מרחק 5 מ׳, לתגמל מבט חוזר', done: false },
        ],
        sessions: [
          { date: '4 באוגוסט', topic: 'מפגש 9 — גירויים ברחוב', sum: 'שיפור עצום בסף התגובה. לונה חוזרת למבט תוך 2 שניות.' },
          { date: '28 ביולי', topic: 'מפגש 8 — עבודת רצועה', sum: 'עבדנו על שינוי כיוון רך. להמשיך תרגול יומי.' },
        ],
        notes: 'לונה רגישה לאופנועים — לתכנן מסלול בהתאם. ליהיא מחויבת מאוד.' },
      { userId: 'omri', plan: 'חרדת נטישה · ליווי חודשי', progress: 55, lastActive: 'אתמול', risk: false,
        goals: 'שהייה לבד עד שעתיים ברוגע',
        homework: [
          { id: 'h4', title: 'יציאות מדורגות — 45 דק׳', desc: 'הקלטה לבדיקת יבבות', done: true },
          { id: 'h5', title: 'טקס יציאה שקט', desc: 'בלי פרידות דרמטיות', done: false },
        ],
        sessions: [
          { date: '1 באוגוסט', topic: 'מפגש 6 — עליית מדרגה', sum: '40 דק׳ לבד בהצלחה. עולים ל־55 דק׳ השבוע.' },
        ],
        notes: 'להזכיר: מצלמה חדשה הותקנה — לבקש קליפים מהשהייה.' },
      { userId: 'noa', plan: 'גורים ובגרות · 8 מפגשים', progress: 38, lastActive: 'לפני יומיים', risk: false,
        goals: 'ריכוז ליד גירויים; עבודה עם כדור כמוטיבציה',
        homework: [
          { id: 'h6', title: 'משחק מובנה עם כדור', desc: '3 סבבים: כדור ← ישיבה ← שחרור', done: false },
        ],
        sessions: [
          { date: '30 ביולי', topic: 'מפגש 3 — מוטיבציה', sum: 'במבה מגיבה מעולה לתגמול משחק. בונים על זה.' },
        ],
        notes: '' },
      { userId: 'tomer', plan: 'מסלול הקאהו · 12 מפגשים', progress: 12, lastActive: 'לפני 6 ימים', risk: true,
        goals: 'הפחתת נביחות על אורחים',
        homework: [
          { id: 'h7', title: 'תרגול "מקום" בכניסת אורח', desc: 'עם בן משפחה, פעמיים השבוע', done: false },
        ],
        sessions: [
          { date: '25 ביולי', topic: 'מפגש היכרות', sum: 'רקס שומר סף קלאסי. בנינו תוכנית מדורגת.' },
        ],
        notes: 'תומר לא פעיל שבוע — לשלוח הודעת עידוד אישית.' },
    ],

    notifications: [
      { ico: '🧡', text: 'גאיה סימנה לייק לפוסט שלך', time: 'לפני שעה', unread: true },
      { ico: '💬', text: 'גאיה הגיבה: "זה בדיוק הרגע שעבדנו בשבילו!"', time: 'לפני שעתיים', unread: true },
      { ico: '📋', text: 'שיעור בית חדש מחכה לך: מפגש מבוקר עם כלב זר', time: 'אתמול', unread: false },
      { ico: '🎧', text: 'פרק חדש בפודקאסט — "הכלב העקשן שלא היה"', time: 'לפני 3 ימים', unread: false },
    ],

    /* יומן פעילות שמוזן אוטומטית ל-CRM של המאלפת */
    activityLog: [
      { ico: '✅', text: '<b>ליהיא</b> סיימה שיעור בית: מזרן רוגע בסלון', time: 'היום 08:40' },
      { ico: '📸', text: '<b>ליהיא</b> שיתפה פריצת דרך בפיד', time: 'היום 07:55' },
      { ico: '✅', text: '<b>עמרי</b> סיים שיעור בית: יציאות מדורגות', time: 'אתמול 19:12' },
      { ico: '⚠️', text: '<b>תומר</b> לא פעיל 6 ימים — מומלץ ליצור קשר', time: 'אתמול' },
      { ico: '💬', text: '<b>נועה</b> פרסמה שאלה לקהילה', time: 'לפני יומיים' },
    ],
  });

  let db = null;
  try {
    const raw = localStorage.getItem(DB_KEY);
    db = raw ? JSON.parse(raw) : null;
  } catch (e) { db = null; }
  if (!db || !db.users) db = seed();

  const save = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} };

  /* API פנימי של האפליקציה */
  window.KDB = {
    get db() { return db; },
    save,
    reset() { db = seed(); save(); },

    user(id) { return db.users.find(u => u.id === id); },
    me() { return this.user(db.currentUserId); },
    avatarColor(id) {
      let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return AVATAR_COLORS[h % AVATAR_COLORS.length];
    },
    initials(name) {
      const p = (name || '').trim().split(/\s+/);
      return (p[0]?.[0] || '🐾') + (p[1]?.[0] || '');
    },

    postsBy(userId) { return db.posts.filter(p => p.userId === userId); },
    client(userId) { return db.clients.find(c => c.userId === userId); },

    toggleLike(postId) {
      const p = db.posts.find(x => x.id === postId);
      if (!p) return;
      const meId = db.currentUserId;
      const i = p.likes.indexOf(meId);
      if (i >= 0) p.likes.splice(i, 1); else p.likes.push(meId);
      save();
      return i < 0;
    },

    addComment(postId, text) {
      const p = db.posts.find(x => x.id === postId);
      if (!p || !text.trim()) return;
      p.comments.push({ userId: db.currentUserId, text: text.trim() });
      save();
    },

    addPost({ caption, tag, media }) {
      db.posts.unshift({
        id: 'p' + Date.now(), userId: db.currentUserId, ts: 'עכשיו',
        tag, media, caption, likes: [], comments: [],
      });
      /* פעילות הלקוח מוזנת אוטומטית ל-CRM */
      const meName = (this.me().name || 'משתמש/ת').split(' ')[0];
      db.activityLog.unshift({ ico: '📸', text: `<b>${meName}</b> שיתפ/ה עדכון חדש בפיד`, time: 'עכשיו' });
      save();
    },

    toggleHomework(clientUserId, hwId) {
      const c = this.client(clientUserId);
      const hw = c?.homework.find(h => h.id === hwId);
      if (!hw) return;
      hw.done = !hw.done;
      if (hw.done) {
        const name = (this.user(clientUserId)?.name || '').split(' ')[0];
        db.activityLog.unshift({ ico: '✅', text: `<b>${name}</b> סיימ/ה שיעור בית: ${hw.title}`, time: 'עכשיו' });
        const done = c.homework.filter(h => h.done).length;
        c.progress = Math.min(100, c.progress + Math.round(30 / c.homework.length));
      }
      save();
    },

    addHomework(clientUserId, title, desc) {
      const c = this.client(clientUserId);
      if (!c || !title.trim()) return;
      c.homework.push({ id: 'h' + Date.now(), title: title.trim(), desc: (desc || '').trim(), done: false });
      save();
    },

    saveNote(clientUserId, text) {
      const c = this.client(clientUserId);
      if (!c) return;
      c.notes = text;
      save();
    },

    /* משתמש חדש שמסיים הרשמה כבעל כלב — נפתחת לו רשומת לקוח ב-CRM */
    enrollAsClient(userId) {
      if (this.client(userId)) return;
      const u = this.user(userId);
      db.clients.unshift({
        userId, plan: 'מסלול הקאהו · 12 מפגשים', progress: 8, lastActive: 'עכשיו', risk: false,
        goals: 'נקבעים יחד במפגש הראשון',
        homework: [
          { id: 'hw-hello', title: 'להכיר את הקהילה', desc: 'להציץ בפיד ולומר שלום בפוסט הראשון 👋', done: false },
          { id: 'hw-watch', title: 'תצפית יומית — 5 דק׳', desc: `לשבת עם ${u?.dog || 'הכלב'} בשקט ולראות מה מעניין אותו`, done: false },
          { id: 'hw-share', title: 'שיתוף ראשון בפיד', desc: 'רגע אחד קטן מהיום — כל צעד שווה תיעוד', done: false },
        ],
        sessions: [
          { date: 'בקרוב', topic: 'מפגש היכרות עם גאיה', sum: 'נכיר, נצפה ונבנה יחד את היעדים שלכם' },
        ],
        notes: '',
      });
      const name = (u?.name || 'לקוח/ה').split(' ')[0];
      db.activityLog.unshift({ ico: '🎉', text: `<b>${name}</b> הצטרפ/ה לקהילה עם ${u?.dog || 'כלב חדש'}`, time: 'עכשיו' });
      db.notifications.unshift({ ico: '📋', text: 'גאיה שלחה לך 3 שיעורי בית ראשונים — מחכים במסלול', time: 'עכשיו', unread: true });
      save();
    },
  };
})();
