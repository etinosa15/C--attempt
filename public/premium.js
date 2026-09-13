import {planPrice,naira,BILLING_OPTIONS,studyInsights} from "./plans.js";
import {memberUser,memberService,hasPremium} from "./member.js";

const PREVIEW_KEY = "forge.premium-preview.v1";
let config, preview = null, billing = "monthly", insightTrack = "all";
const get = selector => document.querySelector(selector);
export const isPremiumPreview = () => hasPremium() || (!memberService().enforcePlans && preview !== null);

export function initPremium(options) {
  config = options;
  try {
    const saved = JSON.parse(localStorage.getItem(PREVIEW_KEY));
    if (saved?.version === 1 && BILLING_OPTIONS.includes(saved.billing)) {
      preview = saved;
      billing = saved.billing;
    }
  } catch { /* A corrupt preview preference must not affect learning progress. */ }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-premium-action],[data-billing],[data-insight-track],[data-study-goal]");
    if (!button) return;
    if (button.dataset.billing) {
      if (!BILLING_OPTIONS.includes(button.dataset.billing)) return;
      billing = button.dataset.billing;
      updatePricing();
    }
    if (button.dataset.insightTrack) {
      insightTrack = button.dataset.insightTrack;
      renderInsightsPage(get("#main"));
    }
    if (button.dataset.studyGoal) {
      const goal = Number(button.dataset.studyGoal);
      if ([15,30,60,90].includes(goal)) config.setGoal(goal);
      renderInsightsPage(get("#main"));
    }
    const action = button.dataset.premiumAction;
    if (action === "upgrade") openUpgrade();
    if (action === "checkout") location.hash = "checkout/" + billing;
    if (action === "manage") location.hash = "account";
    if (action === "close") get("#premium-dialog")?.close();
    if (action === "activate") activatePreview();
    if (action === "leave") {
      preview = null;
      try { localStorage.removeItem(PREVIEW_KEY); } catch { /* Session state still updates. */ }
      config.refresh();
      config.toast("Premium preview ended. Your learning progress is saved.");
    }
    if (action === "compare") get("#plan-comparison")?.scrollIntoView({behavior:"smooth"});
  });
}

const checkList = features => `<ul class="plan-features">${features.map(f=>`<li>${config.icon("check",16)}<span>${f}</span></li>`).join("")}</ul>`;
const billingToggle = () => `<div class="billing-toggle" role="group" aria-label="Premium billing period"><button data-billing="monthly" aria-pressed="${billing === "monthly"}">Monthly</button><button data-billing="yearly" aria-pressed="${billing === "yearly"}">Yearly <span>Save 20%</span></button></div>`;

export function attachPremiumShell() {
  const {icon} = config;
  const active = isPremiumPreview();
  const tip = get(".sidebar-tip");
  if (tip) {
    tip.classList.add("premium-sidebar");
    tip.innerHTML = `<span class="premium-mini-label">${icon("star",15)} FORGE PREMIUM</span><strong>${active ? "Make today count." : "A little more ambition."}</strong><p>${active ? "Your study insights are ready. Find your next step." : "Go deeper with a plan built for focused learning."}</p><a href="${active ? "#insights" : "#premium"}">${active ? "Open study insights" : "Explore the plan"} ${icon("arrow",14)}</a>`;
  }
  get(".topbar-right")?.insertAdjacentHTML("afterbegin", `<a class="premium-header-link ${active ? "is-preview" : ""}" href="#premium">${icon("star",14)}<span>${hasPremium() ? "Premium" : active ? "Premium preview" : "Go Premium"}</span></a>`);
  get('nav a[href="#premium"]')?.classList.add("premium-nav-link");
}

export function planSettingsPanel() {
  const {icon} = config;
  if (hasPremium()) return '<section class="panel settings-panel membership-settings"><div class="settings-icon">'+icon('star',24)+'</div><h2>Your learning plan</h2><div class="membership-status">Premium'+(memberUser().membership.mode==='test'?' · test subscription':'')+'</div><p>Manage your membership, payment history, and renewal from your account.</p><a href="#account" class="button secondary">Manage membership</a></section>';
  if (memberService().enforcePlans) return '<section class="panel settings-panel membership-settings"><h2>Your learning plan</h2><div class="membership-status">Free</div><p>Go beyond the foundations with Premium.</p><a href="#premium" class="button secondary">View plans</a></section>';
  const price = planPrice(preview?.billing || billing);
  return `<section class="panel settings-panel membership-settings"><div class="settings-icon">${icon("star",24)}</div><h2>Your learning plan</h2><div class="membership-status">${preview ? "Premium preview" : "Early access"}<span>No active subscription</span></div><p>${preview ? `You’re trying the ${preview.billing} Premium experience. The planned price is ${naira(price.total)} per ${preview.billing === "yearly" ? "year" : "month"}. No payment has been taken.` : "Explore the Premium plan and try its study insights before paid memberships launch."}</p><div class="membership-actions"><a class="button secondary" href="#premium">View plans ${icon("arrow",15)}</a>${preview ? '<button class="text-button" data-premium-action="leave">Leave preview</button>' : '<button class="button primary" data-premium-action="upgrade">Preview Premium</button>'}</div></section>`;
}

export function renderPremiumPage(main) {
  const {icon,lessons,projects} = config;
  const foundationCount = lessons.filter(l=>l.module===0).length;
  const foundationProjects = projects.filter(p=>p.level==="Foundation").length;
  main.innerHTML = `<section class="premium-hero"><div class="premium-hero-copy"><div class="premium-wordmark">${icon("star",19)} FORGE <span>PREMIUM</span></div><h1>Your ambition.<br>A little more room.</h1><p>Go deeper in JavaScript and C#. Build a steady practice,<br class="desktop-break"> take on bigger projects, and see how far you’ve come.</p><div class="premium-hero-links"><button data-premium-action="compare">Find your plan ${icon("arrow",16)}</button><span>One membership. Both languages.</span></div></div><div class="premium-orb" aria-hidden="true"><div class="premium-orbit orbit-a"></div><div class="premium-orbit orbit-b"></div><span class="premium-spark one">✦</span><div class="premium-emblem">${icon("star",54)}<span>KEEP GOING.</span></div><span class="premium-spark two">+</span><div class="premium-art-label">learn. practice. become.</div></div></section><div class="plan-preview-notice">${icon("help",17)}<p><strong>Explore the plan before launch.</strong> This is an interactive preview. No payments are taken, and your current course access stays available.</p></div>${preview ? `<div class="preview-active-banner"><span>${icon("check",19)}<strong>Your Premium preview is active.</strong></span><a href="#insights">Open your study insights ${icon("arrow",16)}</a></div>` : ""}<section id="plan-comparison" class="plan-pricing-section"><div class="plan-section-heading"><div><div class="eyebrow">CHOOSE YOUR LEARNING RHYTHM</div><h2>Start with curiosity. Stay for growth.</h2></div>${billingToggle()}</div><div class="pricing-grid"><article class="plan-card free-plan"><div class="plan-card-heading"><span class="plan-icon">${icon("book",23)}</span><span class="plan-kind">BUILD YOUR FOUNDATION</span></div><h3>Free</h3><p>Get comfortable with the essentials,<br>one small win at a time.</p><div class="plan-price"><strong>${naira(0)}</strong><span>/ always free</span></div><div class="plan-price-detail">A starting point for curious minds.</div><a class="button secondary plan-button" href="#paths">Explore the foundations ${icon("arrow",16)}</a><div class="plan-feature-label">THE PLANNED FREE PLAN INCLUDES</div>${checkList([`${foundationCount} foundation lessons across both languages`,`${foundationCount} starter coding challenges`,`${foundationProjects} foundation project briefs`,"JavaScript and local C# playgrounds","Notebook, progress tracking, and themes"])}</article><article class="plan-card paid-plan"><div class="plan-ribbon">FOR YOUR NEXT CHAPTER ${icon("star",13)}</div><div class="plan-card-heading"><span class="plan-icon">${icon("star",23)}</span><span class="plan-kind">GO DEEPER. BUILD MORE.</span></div><h3>Premium</h3><p>The full learning path, with a little more<br>structure to turn practice into progress.</p><div class="plan-price" aria-live="polite"><strong data-plan-total></strong><span data-plan-period></span></div><div class="plan-price-detail" data-plan-detail></div><button class="button primary plan-button" data-premium-action="upgrade"><span data-upgrade-label>${preview ? "Review your preview plan" : "Preview Premium"}</span>${icon("arrow",16)}</button><div class="plan-feature-label">EVERYTHING IN FREE, PLUS</div>${checkList([`All ${lessons.length} lessons, from foundations to engineering`,`All ${lessons.length} challenges with executable tests`,`All ${projects.length} projects, including the full-stack capstone`,"Spaced review to strengthen recall","Study insights and a focused daily routine","A personal sequence of upcoming study sessions"])}</article></div><p class="plan-billing-note" data-plan-footnote></p></section><section class="premium-benefits"><div class="plan-section-heading"><div><div class="eyebrow">MORE DIRECTION. MORE POSSIBILITY.</div><h2>Make your practice go further.</h2></div></div><div class="premium-benefit-grid">${[["path","A path beyond the basics","Work through async programming, testing, APIs, security, and the decisions behind maintainable software."],["cards","Keep the ideas that matter","Return to concepts when they’re due. Give your memory the same attention you give your code."],["bolt","Know your next step","See your real progress, finish open challenges, and turn your daily goal into a practical study routine."]].map(([glyph,title,body])=>`<article class="panel premium-benefit">${icon(glyph,24)}<h3>${title}</h3><p>${body}</p></article>`).join("")}</div></section><section class="premium-comparison panel"><div class="comparison-heading"><h2>The plans, side by side.</h2><p>The intended membership benefits at launch.</p></div><div class="plan-table-wrap"><table><caption class="sr-only">Free and Premium plan comparison</caption><thead><tr><th scope="col">Your learning toolkit</th><th scope="col">Free</th><th scope="col">Premium</th></tr></thead><tbody>${[["JavaScript + C# lessons",`${foundationCount} foundations`,`All ${lessons.length} lessons`],["Coding challenges",`${foundationCount} starters`,`All ${lessons.length} challenges`],["Project briefs",`${foundationProjects} foundations`,`All ${projects.length} projects`],["Playgrounds, notes, and themes","Included","Included"],["Spaced review deck","—","Included"],["Study insights & daily routine","—","Included"]].map(([feature,free,paid])=>`<tr><th scope="row">${feature}</th><td>${free}</td><td>${paid}</td></tr>`).join("")}</tbody></table></div></section><section class="premium-faq"><div><div class="eyebrow">A FEW THINGS YOU MIGHT WONDER</div><h2>Clear plans.<br>No surprises.</h2><p>Have something else in mind?<br><a href="#feedback">Tell us what would help ${icon("arrow",15)}</a></p></div><div class="premium-faq-list"><details><summary>Will trying Premium charge me?</summary><p>No. This preview does not collect payment details, start a subscription, or create a renewal. It lets you try the membership experience before checkout is connected.</p></details><details><summary>How does the yearly saving work?</summary><p>Twelve months at ${naira(3000)} would cost ${naira(planPrice("yearly").regularYear)}. The yearly plan is ${naira(planPrice("yearly").total)} paid once per year: 20% off, saving ${naira(planPrice("yearly").annualSaving)}. That works out to ${naira(planPrice("yearly").monthlyEquivalent)} per month.</p></details><details><summary>Are JavaScript and C# both included?</summary><p>Yes. One Premium plan includes both complete learning paths and all six project briefs. C# exercises currently use the .NET SDK on your computer.</p></details><details><summary>What happens to my current progress?</summary><p>Your lessons, notes, and saved code stay on this browser. Starting or leaving the Premium preview does not erase them. You can export a backup in Settings.</p></details><details><summary>Can I leave the preview?</summary><p>Any time. Go to Settings & backups, find Your learning plan, and choose Leave preview. There is no paid subscription to cancel during this preview.</p></details></div></section>`;
  const service = memberService();
  if (service.billingEnabled) {
    const notice = main.querySelector('.plan-preview-notice p');
    notice.textContent = service.billingMode === 'test' ? 'Checkout is connected in test mode. No live payments are taken. Test subscriptions are managed in Account.' : 'One membership includes both languages. Review the recurring price before continuing to secure checkout.';
    const button = main.querySelector('.paid-plan .plan-button');
    button.dataset.premiumAction = hasPremium() ? 'manage' : 'checkout';
    button.querySelector('[data-upgrade-label]').textContent = hasPremium() ? 'Manage membership' : service.billingMode === 'test' ? 'Explore test checkout' : 'Choose Premium';
    main.querySelector('.plan-feature-label').textContent = 'THE FREE PLAN INCLUDES';
  }
  if (hasPremium()) main.querySelector('.plan-preview-notice p').textContent = 'Your Premium membership is active. Open Account to view payments and manage renewal.';
  if (service.runner === 'online') {
    const answer = main.querySelectorAll('.premium-faq-list details p')[2];
    answer.textContent = 'Yes. One Premium plan includes both complete learning paths and all six project briefs. C# exercises use the connected online compiler.';
  }
  updatePricing();
}

function updatePricing() {
  const price = planPrice(billing);
  document.querySelectorAll("[data-billing]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.billing===billing)));
  document.querySelectorAll("[data-plan-total]").forEach(el=>el.textContent=naira(price.total));
  document.querySelectorAll("[data-plan-period]").forEach(el=>el.textContent=billing==="yearly"?"/ year":"/ month");
  document.querySelectorAll("[data-plan-detail]").forEach(el=>el.textContent=billing==="yearly"?`${naira(price.monthlyEquivalent)}/month equivalent · Save ${naira(price.annualSaving)} a year`:`Or choose yearly and save ${naira(planPrice("yearly").annualSaving)}.`);
  document.querySelectorAll("[data-plan-footnote]").forEach(el=>el.textContent=billing==="yearly"?`Yearly plan: one ${naira(price.total)} payment per year at launch. The monthly equivalent is not a monthly payment.`:`Monthly plan: ${naira(price.total)} per month at launch. This preview does not start billing.`);
}

function openUpgrade() {
  if (memberService().enforcePlans) { location.hash="checkout/"+billing; return; }
  if (get("#premium-dialog")) return;
  const {icon} = config;
  const dialog = document.createElement("dialog");
  dialog.id = "premium-dialog";
  dialog.setAttribute("aria-labelledby","upgrade-title");
  dialog.setAttribute("aria-describedby","upgrade-description");
  dialog.innerHTML = `<div class="upgrade-dialog-top"><span class="premium-wordmark">${icon("star",16)} FORGE PREMIUM</span><button class="icon-button" aria-label="Close Premium preview" data-premium-action="close">${icon("close",18)}</button></div><div class="upgrade-dialog-content"><div class="eyebrow">YOUR NEXT CHAPTER</div><h2 id="upgrade-title">Make room for more.</h2><p id="upgrade-description">Preview Premium with the plan that fits your rhythm. No payment details are needed and no subscription will start.</p>${billingToggle()}<div class="upgrade-summary"><div><strong>Forge Premium</strong><span>Both languages. The complete learning path.</span></div><div class="plan-price"><strong data-plan-total></strong><span data-plan-period></span></div><p data-plan-detail></p><div class="upgrade-no-charge"><span>Payment during this preview</span><strong>None</strong></div></div><p class="upgrade-fineprint" data-plan-footnote></p><button class="button primary upgrade-confirm" data-premium-action="activate">${preview ? "Update preview plan" : "Start Premium preview"} ${icon("arrow",17)}</button><button class="text-button upgrade-back" data-premium-action="close">Keep exploring</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener("close",()=>dialog.remove());
  dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
  updatePricing();
  dialog.showModal();
}

function activatePreview() {
  if (memberService().enforcePlans) return;
  preview = {version:1,billing,startedAt:preview?.startedAt || new Date().toISOString()};
  let saved = true;
  try {localStorage.setItem(PREVIEW_KEY,JSON.stringify(preview));} catch {saved=false;}
  get("#premium-dialog")?.close();
  if (location.hash === "#insights") config.refresh(); else location.hash = "insights";
  config.toast(saved ? "Premium preview is ready. No payment was taken." : "Premium preview is ready for this tab. Browser storage is unavailable.");
}

export function renderInsightsPage(main) {
  const {icon,e,lessons,getState} = config;
  if (!isPremiumPreview()) {
    main.innerHTML=`<div class="premium-insights-gate panel"><span class="insight-emblem">${icon("star",36)}</span><div class="eyebrow">PART OF THE PREMIUM EXPERIENCE</div><h1>A little clarity for your next step.</h1><p>Turn your lesson progress into a focused daily routine and a sequence of upcoming study sessions.</p><button class="button primary" data-premium-action="upgrade">Preview study insights ${icon("arrow",16)}</button><a href="#premium">Compare the plans</a><small>No payment details needed. Your current progress stays saved.</small></div>`;
    return;
  }
  const activePlan = memberUser()?.membership || preview;
  const state = getState(), insights = studyInsights(lessons,state,insightTrack);
  const {routine} = insights;
  main.innerHTML = `<div class="insights-heading"><div class="page-heading"><div class="eyebrow">FORGE PREMIUM${hasPremium() ? "" : " · PREVIEW"}</div><h1>Less wondering. More learning.</h1><p>Your real progress, a practical routine, and one clear next step.</p></div><a href="#premium" class="insights-plan-link">${icon("star",15)} ${activePlan.billing === "yearly" ? "Yearly" : "Monthly"} ${hasPremium() ? "membership" : "plan preview"}</a></div><div class="insights-stats"><div class="panel">${icon("book",22)}<strong>${insights.completed}<small> / ${lessons.length}</small></strong><span>Lessons completed</span></div><div class="panel">${icon("code",22)}<strong>${insights.solved}<small> / ${lessons.length}</small></strong><span>Challenges solved</span></div><div class="panel">${icon("cards",22)}<strong>${insights.due.length}</strong><span>Concepts due for review</span></div></div><div class="insights-grid"><section class="panel daily-routine"><div class="section-title"><h2>Make space for today.</h2><span>${routine.goal} MINUTES</span></div><p>Set a realistic goal. Give each part of learning a little attention.</p><div class="study-goal-picker" role="group" aria-label="Daily study goal">${[15,30,60,90].map(goal=>`<button data-study-goal="${goal}" aria-pressed="${goal===routine.goal}">${goal}<span>min</span></button>`).join("")}</div><div class="routine-segments">${[["cards","Recall",routine.reviewMinutes,"Try a review card before revealing the answer."],["book","Understand",routine.learnMinutes,"Read an example and trace each step."],["code","Practice",routine.codeMinutes,"Solve a challenge, then explain what changed."]].map(([glyph,title,minutes,body])=>`<div>${icon(glyph,20)}<span><strong>${title}</strong><small>${body}</small></span><b>${minutes}<small>min</small></b></div>`).join("")}</div><a class="button primary" href="${insights.due.length ? "#review" : insights.upcoming[0] ? "#lesson/"+insights.upcoming[0].id : "#projects"}">${insights.due.length ? "Start with a quick review" : insights.upcoming.length ? "Start your next lesson" : "Choose your next project"} ${icon("arrow",16)}</a></section><section class="panel insight-progress"><h2>Your paths, taking shape.</h2><p>Completion reflects lessons where you passed both the concept check and coding challenge.</p>${insights.tracks.map(track=>`<div class="insight-track"><div><span class="language-badge ${track.lang}">${track.lang==="js"?"JS":"C#"}</span><strong>${track.lang==="js"?"JavaScript":"C#"}</strong><b>${track.percent}%</b></div><div class="progress-track" role="progressbar" aria-label="${track.lang==="js"?"JavaScript":"C#"} completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${track.percent}"><div style="width:${track.percent}%"></div></div><small>${track.done} of ${track.total} lessons completed</small></div>`).join("")}<a href="#paths">See the full curriculum ${icon("arrow",15)}</a></section></div><section class="panel upcoming-sessions"><div class="section-title"><div><h2>A direction for your next five sessions.</h2><p>Pick a focus. Completed lessons automatically move out of this list.</p></div><div class="insight-track-picker" role="group" aria-label="Study focus">${[["all","Both"],["js","JavaScript"],["cs","C#"]].map(([value,label])=>`<button data-insight-track="${value}" aria-pressed="${insightTrack===value}">${label}</button>`).join("")}</div></div>${insights.upcoming.length ? `<div class="session-list">${insights.upcoming.map((lesson,i)=>`<a href="#lesson/${lesson.id}"><span class="session-number">${String(i+1).padStart(2,"0")}</span><span><small>${lesson.lang==="js"?"JAVASCRIPT":"C#"}</small><strong>${e(lesson.title)}</strong></span><span class="session-duration">${lesson.minutes} min lesson</span>${icon("arrow",17)}</a>`).join("")}</div><p class="session-note">Longer lessons can span several daily sessions. Move at a pace that lets the ideas stick.</p>` : '<div class="insight-all-done"><h3>You’ve completed this path.</h3><p>Put the ideas together in a project, or revisit your review deck.</p><a class="button secondary" href="#projects">Explore projects</a></div>'}</section>${insights.needsPractice.length ? `<section class="panel open-challenges"><h2>Close the loop.</h2><p>You’ve made a start on these lessons. Finish the remaining check to complete them.</p>${insights.needsPractice.map(l=>`<a href="#lesson/${l.id}">${e(l.title)} ${icon("arrow",15)}</a>`).join("")}</section>` : ""}<div class="insights-footer-note">${icon("help",15)}<span>${hasPremium() ? "These insights use your learning progress. Account members can sync it across devices." : "These insights use your learning progress. This is a Premium preview, with no active paid subscription."}</span></div>`;
}
