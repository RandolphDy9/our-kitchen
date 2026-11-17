import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanScore, otherScore, scoreProblem } from "../lib/score.ts";

test("normal and win-by-2 games are valid", () => {
  for (const [a, b] of [[11, 0], [11, 9], [7, 11], [12, 10], [10, 12], [15, 13], [30, 28]]) assert.equal(scoreProblem(a, b), null, `${a}-${b}`);
  assert.equal(scoreProblem(null, null), null);
});

test("impossible scores are rejected", () => {
  for (const [a, b] of [[11, 10], [10, 10], [9, 7], [12, 9], [13, 5], [11, 11], [-1, 11], [31, 29], [11.5, 3]]) assert.ok(scoreProblem(a, b), `${a}-${b}`);
  assert.ok(scoreProblem(11, null));
});

test("typed scores are cleaned to 0–30", () => {
  assert.equal(cleanScore("-5"), "5");
  assert.equal(cleanScore("99"), "30");
  assert.equal(cleanScore("007"), "7");
  assert.equal(cleanScore("1e2"), "12");
  assert.equal(cleanScore(""), "");
});

test("a losing score under 10 fills in 11 for the winner", () => {
  assert.equal(otherScore(7), 11);
  assert.equal(otherScore(10), null);
});
