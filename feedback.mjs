import { readFile } from "node:fs/promises";
import path from "node:path";
import { lessons } from "./public/curriculum.js";

const categories = {
  general: "General feedback",
  bug: "Report a problem",
  feature: "Suggest a feature",
  lesson: "Lesson feedback",
};

export async function loadFeedbackKey(root) {
  let key = process.env.WEB3FORMS_ACCESS_KEY?.trim();
  if (!key) {
    try {
      const env = await readFile(path.join(root, ".env"), "utf8");
      const match = env.match(/^\s*WEB3FORMS_ACCESS_KEY\s*=\s*([^\r\n]*)/m);
      key = match?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(key || "") ? key : "";
}

export function validateFeedback(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {error:"Please complete the feedback form."};
  if (input.website) return {error:"The feedback request could not be accepted."};
  for (const field of ["name","email","category","message"]) {
    if (typeof input[field] !== "string") return {error:"Please complete all required fields."};
  }
  const name = input.name.trim(), email = input.email.trim(), message = input.message.trim();
  if (name.length < 2 || name.length > 80 || /[\r\n]/.test(name)) return {error:"Use a name between 2 and 80 characters."};
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return {error:"Enter a valid email address so we can reply."};
  if (!Object.hasOwn(categories,input.category)) return {error:"Choose a feedback category."};
  if (message.length < 20 || message.length > 5000) return {error:"Write between 20 and 5,000 characters of feedback."};
  let lesson;
  if (input.lessonId) {
    lesson = lessons.find(item => item.id === input.lessonId);
    if (!lesson) return {error:"Choose a lesson from the list, or leave it unselected."};
  }
  return {value:{name,email,message,category:categories[input.category],lesson:lesson ? `${lesson.lang === "js" ? "JavaScript" : "C#"}: ${lesson.title}` : "Not specified"}};
}

export async function deliverFeedback(value, key, fetcher = fetch) {
  if (!key) return {status:503,body:{success:false,error:"Feedback delivery is not connected yet. Please try again later."}};
  try {
    const response = await fetcher("https://api.web3forms.com/submit", {
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({access_key:key,from_name:"Forge Code Academy",subject:`Forge feedback — ${value.category}`,name:value.name,email:value.email,message:value.message,category:value.category,lesson:value.lesson,botcheck:false}),
      signal:AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) return {status:502,body:{success:false,error:"The delivery service could not accept your feedback. Your message is still here; please try again later."}};
    return {status:200,body:{success:true,message:"Thanks for helping shape Forge. Your feedback was accepted for delivery."}};
  } catch {
    return {status:502,body:{success:false,error:"We couldn’t confirm delivery. Your message is still here. Please try again later; a retry could send a duplicate if the first request arrived."}};
  }
}
