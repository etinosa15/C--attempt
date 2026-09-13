export const PREMIUM_MONTHLY_NAIRA = 3000;
export const YEARLY_DISCOUNT = 0.20;
export const BILLING_OPTIONS = ["monthly", "yearly"];
export const naira = (amount) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(amount);

export function planPrice(billing = "monthly") {
  const yearly = billing === "yearly";
  const regularYear = PREMIUM_MONTHLY_NAIRA * 12;
  const total = yearly ? Math.round(regularYear * (1 - YEARLY_DISCOUNT)) : PREMIUM_MONTHLY_NAIRA;
  return {billing: yearly ? "yearly" : "monthly", total, monthlyEquivalent: yearly ? total / 12 : total,
    annualSaving: yearly ? regularYear - total : 0, regularYear};
}

export function studyInsights(lessons, state, track = "all", now = Date.now()) {
  const completed = new Set(state.completed);
  const solved = new Set(state.solved);
  const selected = lessons.filter(l => track === "all" || l.lang === track);
  const js = selected.filter(l => l.lang === "js" && !completed.has(l.id));
  const cs = selected.filter(l => l.lang === "cs" && !completed.has(l.id));
  const upcoming = [];
  for (let i = 0; i < Math.max(js.length, cs.length); i++) {
    if (js[i]) upcoming.push(js[i]);
    if (cs[i]) upcoming.push(cs[i]);
  }
  const needsPractice = selected.filter(l => !completed.has(l.id) && (state.quizzes[l.id] || solved.has(l.id)));
  const due = lessons.filter(l => completed.has(l.id) && (!state.reviews[l.id] || state.reviews[l.id].due <= now));
  const goal = [15,30,60,90].includes(state.goal) ? state.goal : 30;
  const reviewMinutes = Math.round(goal * 0.15), learnMinutes = Math.round(goal * 0.30);
  return {
    completed: lessons.filter(l=>completed.has(l.id)).length,
    solved: lessons.filter(l=>solved.has(l.id)).length,
    due, upcoming: upcoming.slice(0,5), needsPractice: needsPractice.slice(0,3),
    routine: {goal,reviewMinutes,learnMinutes,codeMinutes:goal-reviewMinutes-learnMinutes},
    tracks: ["js","cs"].map(lang => {
      const list=lessons.filter(l=>l.lang===lang), done=list.filter(l=>completed.has(l.id)).length;
      return {lang,done,total:list.length,percent:list.length ? Math.round(done/list.length*100) : 0};
    }),
  };
}
