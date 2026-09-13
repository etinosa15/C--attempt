let draft = {name:"",email:"",category:"general",lessonId:"",message:"",website:""};
let sending = false;
let receipt = null;
let delivery = {};
let helpers;

export function updateFeedbackStatus(status) {
  delivery = status;
  const notice = document.querySelector("#feedback-availability");
  if (notice) {
    notice.hidden = status.feedbackEnabled === true;
    notice.textContent = status.feedbackUnavailable
      ? "The local server is unavailable. Keep it running and refresh the page to send feedback."
      : status.feedbackEnabled === false
      ? "Feedback delivery hasn’t been connected yet. You can explore the form; please return later to send."
      : "Checking feedback availability…";
  }
  const submit = document.querySelector("#feedback-submit");
  if (submit) submit.disabled = sending || status.feedbackEnabled !== true;
}

function feedbackResult() {
  const box = document.querySelector("#feedback-result");
  if (!box) return;
  const {e,icon} = helpers;
  box.hidden = !receipt;
  if (!receipt) {box.innerHTML="";return;}
  box.className = "feedback-result " + receipt.kind;
  box.setAttribute("role",receipt.kind === "error" ? "alert" : "status");
  box.innerHTML = `<span>${icon(receipt.kind === "success" ? "check" : "help",22)}</span><div><h3>${receipt.kind === "success" ? "A better Forge starts with you." : "Your message is still here."}</h3><p>${e(receipt.message)}</p>${receipt.kind === "success" ? '<button type="button" class="button secondary" id="feedback-another">Write another message</button>' : ""}</div>`;
  document.querySelector("#feedback-another")?.addEventListener("click",()=>{
    receipt=null;
    renderFeedbackPage(document.querySelector("#main"),helpers);
    document.querySelector("#feedback-name").focus();
  });
}

export function renderFeedbackPage(main, options) {
  helpers=options;
  const {e,icon,lessons,getStatus}=options;
  main.innerHTML=`<div class="page-heading"><div class="eyebrow">BUILT WITH YOUR FEEDBACK</div><h1>Help shape what comes next.</h1><p>Something confusing? An idea worth building? We’re listening.</p></div><div class="feedback-layout"><section class="panel feedback-form-panel"><div class="feedback-intro"><span class="feedback-emblem">${icon("message",24)}</span><div><h2>Your experience matters.</h2><p>A small observation can make a big difference.</p></div></div><div id="feedback-availability" class="feedback-availability" role="status"></div><div id="feedback-result" hidden></div><form id="feedback-form" ${receipt?.kind === "success" ? "hidden" : ""}><fieldset ${sending?"disabled":""}><legend class="sr-only">Share feedback with the Forge team</legend><div class="feedback-field-row"><div class="feedback-field"><label for="feedback-name">Your name</label><input id="feedback-name" name="name" autocomplete="name" required minlength="2" maxlength="80" placeholder="What should we call you?" value="${e(draft.name)}"></div><div class="feedback-field"><label for="feedback-email">Email address</label><input id="feedback-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com" value="${e(draft.email)}"><small>So we can follow up if needed.</small></div></div><div class="feedback-field"><label for="feedback-category">What’s on your mind?</label><select id="feedback-category" name="category" required>${[["general","General feedback"],["bug","Report a problem"],["feature","Suggest a feature"],["lesson","Lesson feedback"]].map(([v,label])=>`<option value="${v}" ${draft.category===v?"selected":""}>${label}</option>`).join("")}</select></div><div class="feedback-field"><label for="feedback-lesson">Related lesson <span>optional</span></label><select id="feedback-lesson" name="lessonId"><option value="">Not about a specific lesson</option>${["js","cs"].map(lang=>`<optgroup label="${lang==="js"?"JavaScript":"C#"}">${lessons.filter(l=>l.lang===lang).map(l=>`<option value="${l.id}" ${draft.lessonId===l.id?"selected":""}>${e(l.title)}</option>`).join("")}</optgroup>`).join("")}</select></div><div class="feedback-field"><label for="feedback-message">Tell us a little more</label><textarea id="feedback-message" name="message" required minlength="20" maxlength="5000" rows="7" aria-describedby="feedback-message-help feedback-count" placeholder="What worked, what didn’t, or what would make learning here better?">${e(draft.message)}</textarea><div class="feedback-message-meta"><small id="feedback-message-help">At least 20 characters. Details help us understand.</small><small id="feedback-count">${draft.message.length.toLocaleString()} / 5,000</small></div></div><div class="feedback-honeypot" aria-hidden="true"><label for="feedback-website">Leave this field empty</label><input type="text" id="feedback-website" name="website" tabindex="-1" autocomplete="off" value=""></div><div class="feedback-submit-row"><p>Your name, email, and feedback will be sent to the Forge team through <a href="https://web3forms.com/privacy" target="_blank" rel="noopener noreferrer">Web3Forms</a>.</p><button id="feedback-submit" type="submit" class="button primary" ${sending?"disabled":""}>${sending?'<span class="spinner"></span> Sending…':`Send feedback ${icon("arrow",16)}`}</button></div></fieldset></form></section><aside class="feedback-aside"><div class="panel feedback-tips"><span class="little-spark">✳</span><h2>Good feedback opens doors.</h2><div><h3>${icon("help",17)} Found a problem?</h3><p>Tell us what you tried, what you expected, and what happened instead.</p></div><div><h3>${icon("bolt",17)} Have an idea?</h3><p>Tell us what you want to achieve and how the change would help you learn.</p></div><div><h3>${icon("book",17)} A lesson didn’t click?</h3><p>Pick the lesson and point to the explanation or exercise that needs another look.</p></div></div><div class="feedback-small-note">${icon("note",18)}<p>Your feedback text stays in this tab if delivery fails, so you can try again. It is not added to your saved notebook.</p></div></aside></div>`;
  const form=document.querySelector("#feedback-form");
  form.addEventListener("input",()=>{
    if(sending)return;
    draft=Object.fromEntries(new FormData(form));
    document.querySelector("#feedback-count").textContent=`${draft.message.length.toLocaleString()} / 5,000`;
  });
  form.addEventListener("submit",submitFeedback);
  updateFeedbackStatus(getStatus());
  feedbackResult();
}

async function submitFeedback(event) {
  event.preventDefault();
  if(sending)return;
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  draft=Object.fromEntries(new FormData(form));
  sending=true;receipt=null;
  form.querySelector("fieldset").disabled=true;
  const submit=document.querySelector("#feedback-submit");
  submit.disabled=true;submit.innerHTML='<span class="spinner"></span> Sending…';
  feedbackResult();
  try {
    // Fetch a fresh token so a server restart does not discard a drafted message.
    const statusResponse=await fetch("/api/status",{signal:AbortSignal.timeout(5000)});
    if(!statusResponse.ok)throw new Error("status");
    const status=await statusResponse.json();
    const response=await fetch("/api/feedback",{
      method:"POST",headers:{"Content-Type":"application/json","X-Forge-Token":status.token},
      body:JSON.stringify(draft),signal:AbortSignal.timeout(20000),
    });
    const result=await response.json();
    if(response.ok && result.success === true){
      receipt={kind:"success",message:result.message};
      draft={name:"",email:"",category:"general",lessonId:"",message:"",website:""};
    }else receipt={kind:"error",message:result.error||"We couldn’t confirm delivery. Please try again later."};
  }catch{
    receipt={kind:"error",message:"We couldn’t confirm delivery. Check your connection and keep the Forge server running. A retry could send a duplicate if the first request arrived."};
  }finally{
    sending=false;
    const current=document.querySelector("#feedback-form");
    if(current){
      current.querySelector("fieldset").disabled=false;
      current.hidden=receipt.kind === "success";
      document.querySelector("#feedback-submit").innerHTML=`Send feedback ${helpers.icon("arrow",16)}`;
      updateFeedbackStatus(delivery);
      feedbackResult();
      document.querySelector("#feedback-result").scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  }
}
