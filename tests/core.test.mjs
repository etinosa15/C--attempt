import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,sanitizeState,dayKey,streak,scheduleReview,escapeHtml,highlight} from '../public/core.js';
import {lessons,projects} from '../public/curriculum.js';
test('curriculum IDs are unique and challenges include edge cases',()=>{
 assert.equal(lessons.length,40);assert.equal(new Set(lessons.map(l=>l.id)).size,40);
 for(const l of lessons){assert.ok(l.sections.length>=3);assert.ok(l.challenge.tests.length>=3);assert.ok(l.quiz.answer>=0&&l.quiz.answer<l.quiz.choices.length);assert.ok(l.challenge.solution);}
 assert.equal(projects.length,6);
});
test('saved progress rejects bad shapes and preserves valid work',()=>{
 const state=freshState();state.completed=['js-values','js-values'];state.notes={'js-values':'my note'};state.reviews={good:{due:123,interval:1,count:2},bad:'invalid'};state.activity={'2026-09-12':2,wrong:'x'};state.projectChecks={habit:[0,0,1,99],bad:'bad'};
 const normalized=sanitizeState(state);assert.deepEqual(normalized.completed,['js-values']);assert.equal(normalized.notes['js-values'],'my note');assert.deepEqual(normalized.projectChecks.habit,[0,1]);assert.equal(normalized.reviews.bad,undefined);assert.equal(normalized.activity.wrong,undefined);assert.throws(()=>sanitizeState({version:9}));
});
test('streak handles today, yesterday, gaps and month boundaries',()=>{
 const now=new Date(2026,8,1,12);assert.equal(dayKey(now),'2026-09-01');
 assert.equal(streak({'2026-09-01':1,'2026-08-31':1},now),2);
 assert.equal(streak({'2026-08-31':1,'2026-08-30':2},now),2);
 assert.equal(streak({'2026-08-30':1},now),0);
});
test('review intervals match the learner-facing policy',()=>{
 assert.equal(scheduleReview(null,'again',0).due,600000);
 assert.equal(scheduleReview(null,'hard',0).due,86400000);
 assert.equal(scheduleReview(null,'good',0).interval,1);
 assert.equal(scheduleReview({interval:1,count:1},'good',0).interval,3);
 assert.equal(scheduleReview({interval:60,count:20},'good',0).interval,60);
});
test('rendered user code and notes cannot inject HTML',()=>{
 assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 assert.ok(!highlight('const x = "<script>";').includes('<script>'));
});
