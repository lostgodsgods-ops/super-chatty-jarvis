import test from "node:test";
import assert from "node:assert/strict";
import { APP_HTML } from "../staging/app.mjs";

test("voice UI exposes bilingual mobile-first controls", () => {
  assert.match(APP_HTML, /name="viewport"/);
  assert.match(APP_HTML, /value="hi-IN"/);
  assert.match(APP_HTML, /value="en-IN"/);
  assert.match(APP_HTML, /id="mic"/);
  assert.match(APP_HTML, /SpeechRecognition/);
  assert.match(APP_HTML, /speechSynthesis/);
});

test("voice UI requires server session and avoids browser token storage", () => {
  assert.match(APP_HTML, /fetch\("\/auth\/status"/);
  assert.match(APP_HTML, /credentials:"same-origin"/);
  const scriptStart = APP_HTML.indexOf("<script>");
  const scriptEnd = APP_HTML.indexOf("</script>", scriptStart);
  const script = scriptStart >= 0 && scriptEnd > scriptStart ? APP_HTML.slice(scriptStart + 8, scriptEnd) : "";
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
});

test("voice UI does not pretend AI backend is live when unconfigured", () => {
  assert.match(APP_HTML, /AI response service is not connected/);
  assert.match(APP_HTML, /Chat backend is not configured in staging yet/);
  assert.match(APP_HTML, /fetch\("\/api\/chat"/);
});
