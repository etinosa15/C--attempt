import test from "node:test";
import assert from "node:assert/strict";
import { certificateEarned, certificateSvg } from "../public/core.js";

test("a track is earned only when every lesson id is completed", () => {
  const ids = ["a", "b", "c"];
  assert.equal(certificateEarned(["a", "b", "c", "z"], ids), true);
  assert.equal(certificateEarned(["a", "b"], ids), false);
  assert.equal(certificateEarned([], ids), false);
  assert.equal(certificateEarned(["a"], []), false, "no lessons means nothing to earn");
});

test("certificateSvg carries the learner, track, date and the honest framing", () => {
  const svg = certificateSvg({
    name: "Ada Lovelace",
    trackName: "JavaScript Foundations",
    dateText: "September 23, 2026",
  });
  assert.match(svg, /^<svg/);
  assert.match(svg, /Ada Lovelace/);
  assert.match(svg, /JavaScript Foundations/);
  assert.match(svg, /September 23, 2026/);
  assert.match(svg, /not a professional credential/);
});

test("certificateSvg escapes hostile input and defaults a missing name", () => {
  const svg = certificateSvg({ name: "<script>", trackName: "C#" });
  assert.doesNotMatch(svg, /<script>/);
  const anon = certificateSvg({ trackName: "C#" });
  assert.match(anon, /A dedicated learner/);
});
