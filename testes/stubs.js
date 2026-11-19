exports.app = `export const initializeApp = () => ({});`;
exports.auth = `
const cbs = [];
const auth = { currentUser: null };
const fire = () => setTimeout(() => cbs.forEach(c => c(auth.currentUser)), 10);
auth.currentUser = window.__user || null;
export const getAuth = () => auth;
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
export const getRedirectResult = async () => null;
export const onAuthStateChanged = (a, cb) => { cbs.push(cb); setTimeout(() => cb(auth.currentUser), 10); };
export const signOut = async () => { auth.currentUser = null; fire(); };
export class GoogleAuthProvider { setCustomParameters() {} }
export const signInWithPopup = async () => { auth.currentUser = {uid: "g1", email: "g@teste.local", displayName: "Fulano", providerData: [{providerId: "google.com"}]}; fire(); };
export const signInWithRedirect = async () => {};
export const signInWithEmailAndPassword = async (a, m, p) => { if (p !== "123456") { const e = new Error("x"); e.code = "auth/invalid-credential"; throw e; } auth.currentUser = {uid: "u1", email: m, displayName: "", providerData: []}; fire(); };
export const createUserWithEmailAndPassword = async (a, m) => { auth.currentUser = {uid: "novo1", email: m, displayName: "", providerData: []}; fire(); return {user: auth.currentUser}; };
export const updateProfile = async () => {};
export const sendPasswordResetEmail = async () => { window.__reset = true; };
`;
exports.fs = `
const db = window.__db = window.__db || {};
const subs = [];
const ts = () => ({toMillis: () => Date.now()});
const mk = (path, d) => ({id: path.split("/").pop(), ref: {path}, exists: () => d !== undefined, data: () => d === undefined ? undefined : {...d}});
const inColl = (p, c) => p.startsWith(c + "/") && !p.slice(c.length + 1).includes("/");
const run = q => { let r = Object.keys(db).filter(p => inColl(p, q.path)).map(p => mk(p, db[p]));
  for (const w of q.w || []) r = r.filter(d => { const v = d.data()[w.f]; return w.op === "==" ? v === w.v : w.op === ">=" ? v >= w.v : true; });
  return {docs: r}; };
const notify = () => subs.slice().forEach(s => { try { s.t.coll ? s.cb(run(s.t)) : s.cb(mk(s.t.path, db[s.t.path])); } catch (e) { console.error("stub", e); } });
window.__notify = notify;   // o teste mexe no banco na mão e avisa quem está ouvindo
const apply = (old, data) => { const o = {...(old || {})}; for (const k in data) { const v = data[k]; o[k] = v && v.__inc ? (o[k] || 0) + v.__inc : v; } return o; };
export const getFirestore = () => ({});
export const doc = (d, ...s) => ({path: s.join("/")});
export const collection = (d, ...s) => ({path: s.join("/"), coll: true});
export const query = (c, ...k) => ({...c, w: k.filter(x => x.f)});
export const where = (f, op, v) => ({f, op, v});
export const orderBy = () => ({}); export const limit = () => ({});
export const increment = n => ({__inc: n});
export const serverTimestamp = ts;
export const getDoc = async r => mk(r.path, db[r.path]);
export const getDocs = async q => run(q);
export const setDoc = async (r, data, o) => { db[r.path] = o && o.merge ? apply(db[r.path], data) : apply({}, data); notify(); };
export const updateDoc = async (r, data) => { if (!db[r.path]) throw new Error("no doc"); db[r.path] = apply(db[r.path], data); notify(); };
export const deleteDoc = async r => { delete db[r.path]; notify(); };
export const addDoc = async (c, data) => { const p = c.path + "/id" + Math.random().toString(36).slice(2, 8); db[p] = apply({}, data); notify(); return {path: p}; };
export const onSnapshot = (t, cb, er) => { const s = {t, cb}; subs.push(s); setTimeout(() => { t.coll ? cb(run(t)) : cb(mk(t.path, db[t.path])); }, 10); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; };
export const writeBatch = () => { const ops = []; return {update: (r, d) => ops.push([r, d]), commit: async () => { ops.forEach(([r, d]) => db[r.path] = apply(db[r.path], d)); notify(); }}; };
`;

exports.msg = `
export const isSupported = async () => true;
export const getMessaging = () => ({});
export const getToken = async (m, o) => { window.__vapid = o && o.vapidKey; return window.__token || "tok-de-teste"; };
export const onMessage = (m, cb) => { window.__onMessage = cb; };
`;
