# Synthetic validation

## Automated checks

Run `npm run lint` and `npm test`. These tests never invoke the installed quota-axi. Executable fixtures run in ignored `.test-tmp/` directories inside the checkout and are removed afterward. The test-only browser entry point is `npm run test:demo`, using `test/fixtures/quota-mock.mjs` and returning a valid schema-5 report on exit 1.

GitHub CI runs the same checks on Node 22 and 24. `test/ui.test.js` covers DOM rendering, manual refresh, visible/hidden auto-checks, transport failure recovery, unsupported schema, empty reports, rate limits, untrusted windows, and safe text rendering.

## Actual Chrome check

With the synthetic demo running, use a dedicated chrome-devtools-axi session:

```sh
export CHROME_DEVTOOLS_AXI_SESSION=quota-axi-web-test
chrome-devtools-axi open http://127.0.0.1:4318
chrome-devtools-axi snapshot
chrome-devtools-axi emulate --viewport '1440x1100x1' --color-scheme light
chrome-devtools-axi eval '() => {
  if (document.querySelectorAll(".card").length !== 6) throw Error("missing cards");
  for (const text of ["72%", "0%", "Quota unknown", "Provider error", "Authentication needed", "Stale"]) {
    if (!document.body.textContent.includes(text)) throw Error("missing state: " + text);
  }
  if (document.documentElement.scrollWidth > innerWidth) throw Error("horizontal overflow");
  if (performance.getEntriesByType("resource").some(r => !r.name.startsWith(location.origin))) throw Error("remote asset");
  return "PASS: six synthetic providers, expected states, local resources, no overflow";
}'
```

Click the refresh button using its snapshot reference with `chrome-devtools-axi click @<ref>`. The last-acquired timestamp should remain unchanged during cooldown. Repeat screenshot inspection and the assertions for desktop dark and `390x844x2,mobile,touch` light/dark. Pass viewport and color scheme together: changing emulation without a viewport may reset its previous viewport.

Local request protections can also be asserted from the actual page:

```sh
chrome-devtools-axi eval 'async () => {
  const get = await fetch("/api/quota");
  const simple = await fetch("/api/quota", {method:"POST"});
  if (get.status !== 405 || simple.status !== 403) throw Error("protection failure");
  return "PASS: GET 405, simple POST 403";
}'
```

These deliberately rejected calls produce expected network errors, not product failures. Host spoofing, hostile Origin, cross-site/same-site metadata, bodies, and concurrent acquisition are exercised by the HTTP tests.

## Initial implementation evidence

Validated with Node 26.8.2 locally and Chrome via chrome-devtools-axi, using only synthetic data:

- Real mock executable through HTTP through browser, including valid JSON on exit 1: six provider cards, zero remaining distinct from unknown, resets, stale windows, authentication and provider errors.
- Desktop 1440×1100 and mobile 390×844, light and dark: screenshots inspected, readable responsive layout with no horizontal overflow; assets and endpoint requests stayed on the loopback origin.
- Manual button click and repeated endpoint requests preserved the acquisition timestamp during cooldown.
- In-page synthetic failure injections exercised acquisition failure, stale last-good data, no-report/unsupported-schema display, disconnected-server messaging, and recovery. These are browser presentation checks; corresponding subprocess failures are covered separately by Node tests.
- The normal page had no console errors. Deliberate forbidden API requests returned 405 and 403 as expected.

The optional `chrome-devtools-axi run` wrapper failed with `Error: fn is not a function` before completing its scripted checks. Validation continued with direct `eval`, `click`, `snapshot`, and `screenshot` commands; no failing wrapper script is shipped. Screenshots are local ignored artifacts, not real quota captures. No live provider polling or workstation installation was performed.
