import test from "node:test";
import assert from "node:assert/strict";
import {validateFeedback,deliverFeedback} from "../feedback.mjs";

const valid = {name:" Test Learner ",email:" learner@example.com ",category:"feature",message:"Please add more examples to the lessons.",lessonId:"js-values",website:""};
test("feedback validates boundaries and permits only known categories and lessons",()=>{
  const {value} = validateFeedback(valid);
  assert.equal(value.name,"Test Learner");assert.equal(value.email,"learner@example.com");assert.equal(value.category,"Suggest a feature");assert.match(value.lesson,/JavaScript/);
  for (const input of [null,[],{...valid,message:"short"},{...valid,name:"  "},{...valid,email:"not-email"},{...valid,category:"__proto__"},{...valid,lessonId:"unknown"},{...valid,message:"a".repeat(5001)},{...valid,website:"spam"}]) assert.ok(validateFeedback(input).error);
});
test("feedback sends only the intended fields to Web3Forms and reports confirmed acceptance",async()=>{
  const {value}=validateFeedback({...valid,access_key:"injected",subject:"ignored"});
  const result=await deliverFeedback(value,"test-key",async(url,options)=>{
    assert.equal(url,"https://api.web3forms.com/submit");
    const payload=JSON.parse(options.body);
    assert.equal(payload.access_key,"test-key");assert.equal(payload.subject,"Forge feedback — Suggest a feature");assert.equal(payload.email,"learner@example.com");assert.equal(payload.botcheck,false);
    return {ok:true,json:async()=>({success:true})};
  });
  assert.equal(result.status,200);assert.equal(result.body.success,true);
});
test("missing configuration and failed delivery never report success",async()=>{
  const {value}=validateFeedback(valid);
  const missing=await deliverFeedback(value,"",()=>{throw new Error("Must not contact provider");});assert.equal(missing.status,503);
  for(const fetcher of [async()=>({ok:true,json:async()=>({success:false})}),async()=>({ok:false,json:async()=>({success:true})}),async()=>{throw new Error("offline");},async()=>({ok:true,json:async()=>{throw new Error("Invalid JSON");}})]){
    const result=await deliverFeedback(value,"test-key",fetcher);assert.equal(result.status,502);assert.equal(result.body.success,false);
  }
});
