export const STORAGE_KEY = 'forge.academy.v1';
export const freshState = () => ({version:1, completed:[], quizzes:{}, solved:[], drafts:{}, notes:{}, reviews:{}, activity:{}, projectChecks:{}, lastLesson:null, goal:30, focusSeconds:0});
export function sanitizeState(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) throw new Error('This is not a Forge progress file.');
  for (const key of ['completed','solved']) if (Array.isArray(raw[key])) base[key] = [...new Set(raw[key].filter(v => typeof v === 'string'))];
  for (const key of ['quizzes','drafts','notes','reviews','activity','projectChecks']) if (raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key])) base[key] = Object.fromEntries(Object.entries(raw[key]).filter(([k])=>!['__proto__','constructor','prototype'].includes(k)));
  for (const key of ['drafts','notes']) base[key] = Object.fromEntries(Object.entries(base[key]).filter(([,v])=>typeof v === 'string').map(([k,v])=>[k,v.slice(0,100000)]));
  base.quizzes=Object.fromEntries(Object.entries(base.quizzes).filter(([,v])=>v===true));
  base.reviews=Object.fromEntries(Object.entries(base.reviews).filter(([,v])=>v && typeof v==='object' && Number.isFinite(v.due) && Number.isFinite(v.interval) && Number.isFinite(v.count) && v.interval>=0 && v.count>=0));
  base.activity=Object.fromEntries(Object.entries(base.activity).filter(([k,v])=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0));
  base.projectChecks=Object.fromEntries(Object.entries(base.projectChecks).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,[...new Set(v.filter(n=>Number.isInteger(n)&&n>=0&&n<6))]]));
  base.goal = [15,30,60,90].includes(raw.goal) ? raw.goal : 30;
  base.focusSeconds = Number.isFinite(raw.focusSeconds) ? Math.max(0, raw.focusSeconds) : 0;
  base.lastLesson = typeof raw.lastLesson === 'string' ? raw.lastLesson : null;
  return base;
}
export function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function streak(activity, date = new Date()) {
  const d = new Date(date); let n=0;
  if (!activity[dayKey(d)]) d.setDate(d.getDate()-1);
  while (activity[dayKey(d)] && n<36600) { n++; d.setDate(d.getDate()-1); }
  return n;
}
export function scheduleReview(previous, rating, now = Date.now()) {
  const count = Math.max(0, Number(previous?.count)||0);
  const interval = rating === 'again' ? 0 : rating === 'hard' ? 1 : Math.min(60, Math.max(1, Math.round((Number(previous?.interval)||0.4)*2.5)));
  return {count:count+1, interval, due:now+(rating === 'again' ? 10*60*1000 : interval*86400000)};
}
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function highlight(code) {
  const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\b(?:const|let|var|function|return|if|else|for|of|in|while|class|new|static|public|private|void|int|string|bool|decimal|double|async|await|try|catch|throw|using|namespace|record|interface|true|false|null|undefined|this|yield|switch|case|break|out|readonly|override|Task)\b|\b\d+(?:\.\d+)?\b)/g;
  let out='', index=0;
  for (const m of code.matchAll(re)) { out+=escapeHtml(code.slice(index,m.index)); const t=m[0]; out+=`<span class="tok-${t.startsWith('//')?'comment':/^["'`]/.test(t)?'string':/^\d/.test(t)?'number':'keyword'}">${escapeHtml(t)}</span>`; index=m.index+t.length; }
  return out+escapeHtml(code.slice(index));
}
