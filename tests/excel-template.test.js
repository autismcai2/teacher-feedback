import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("generated Excel template uses Songti as the table font", () => {
  assert.match(appSource, /font-family:\s*"宋体"/);
});

test("generated Excel template does not include the placeholder slash column", () => {
  assert.doesNotMatch(appSource, /<td class="label">\/<\/td>/);
  assert.doesNotMatch(appSource, /<td><\/td>/);
});

test("generated Excel key-point section spans the remaining left-side columns", () => {
  assert.match(appSource, /<td class="blue" colspan="6">二、本节课重难点<\/td>/);
  assert.match(appSource, /<td class="text" colspan="6">一、知识重点/);
});
