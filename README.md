# quota-axi-web

A small, local-only browser dashboard for [quota-axi](https://github.com/kunchenguid/quota-axi). Public source, private local quota data. This is an independent CLI consumer, not a hosted service or an upstream quota-axi feature.

## Run locally

Prerequisites: macOS or Linux, Node.js **22.19+** (or a newer supported LTS), npm, and an already installed `quota-axi` on your PATH. The viewer supports **JSON schemaVersion 5**, verified against quota-axi 0.1.46. Set up provider authentication separately with your existing provider tools. No credentials are entered here.

From this repository:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4317** directly in your browser. Stop with **Ctrl+C** in the same terminal. An occupied port can be changed with `npm start -- --port 4319`. The host cannot be changed. Nothing installs a service, opens a browser automatically, or activates at login.

There are no runtime npm dependencies or build steps. The installed npm dependencies are only for development checks.

## What you see

- Provider order and individual quota windows as reported by the CLI, with remaining percentages, resets, and credits when available. No inferred missing percentages, overall score, routing advice, or provider logic.
- Explicit unknown, stale, authentication-needed, rate-limited, and provider-error states. A successful CLI acquisition does **not** imply every provider succeeded.
- Last successful acquisition, next eligible provider check, and last-good readings marked stale if a later acquisition fails.
- Keyboard-accessible controls, responsive layouts, and automatic OS light/dark theme. Browser date/time formatting uses your local timezone.

Default quota-axi JSON omits some fields, including individual provider refresh timestamps and pace inputs. “Provider update time unknown” is intentional. This is not an exact reproduction of quota-axi's terminal UI. Detailed diagnostic errors are deliberately not sent to the browser; investigate using quota-axi in your own terminal.

## Acquisition and cooldown

On the first browser check, the server runs exactly:

```sh
quota-axi --json --no-credential-refresh
```

It uses fixed arguments and `shell: false`, with a 45-second timeout and a combined 1 MiB stdout/stderr limit. Exit **1** with a valid report is accepted; unexpected exits, invalid JSON, and unsupported schemas are acquisition errors. Concurrent tabs share one in-flight acquisition and an in-memory last-good report.

Visible tabs check the local endpoint every 30 seconds. **Provider acquisitions are at least five minutes apart**, measured from completion, and no polling occurs without browser requests. Hidden tabs pause their checks. **Refresh now** checks immediately but returns cached results during cooldown; it cannot force provider calls. All tabs share the same server-owned deadline.

Any provider `retryAfter` extends the deadline for the whole CLI, so even a healthy provider waits for the slowest provider. Rate limits without a useful deadline back off 15, 30, then 60 minutes; subprocess failures back off 5, 10, 20, 40, then 60 minutes. These are conservative viewer safeguards, not provider-specific rate-limit implementations. Restarting the foreground server clears its in-memory cache and cooldown, so do not use restarts or parallel server instances to work around a provider limit. Upstream quota-axi may also retain its own cache and cooldown state.

## Privacy and local boundary

- HTTP binds **only to 127.0.0.1**. Host and Origin are checked, cross-site/same-site browser requests are refused, and acquisition requires an empty same-origin POST with a custom header. No CORS is enabled. Open the address directly rather than from an external-site link, which may be refused by the cross-site navigation protection.
- HTML, JS, CSS, and fonts are local. No CDNs, telemetry, cloud storage, remote images, browser credential management, or public quota hosting. No quota data is written by this viewer or stored in browser local storage. HTTP responses are `no-store`; assets and quota values stay in process memory.
- Only allowlisted display fields reach the browser. Accounts, plans, source attempts, raw error messages, and credential-remedy commands are discarded. The default redacted CLI output is used, never `--full`.
- The **CLI still reads its existing local credentials, may contact providers, and may update its own quota cache**. “Local only” means local presentation, not offline acquisition. The viewer disables credential renewal and does not enable Keychain prompts. Authentication and recovery remain explicit actions outside the viewer.
- Loopback is not authentication against other applications on your machine or privileged browser extensions. Do not expose this port with a reverse proxy, tunnel, container public mapping, or hosting service. Stop the process when finished.

## Development and tests (no real credentials)

```sh
npm ci
npm run lint
npm test
npm run test:demo
```

The demo is **synthetic only** at http://127.0.0.1:4318. It injects the fixed executable `test/fixtures/quota-mock.mjs`; no production command-line flag, environment setting, or HTTP input can select a fixture or arbitrary executable. Stop it with Ctrl+C. Do not use `npm start` for automated tests: that is the real CLI path.

Node tests cover real mock subprocess execution, exit-1 reports, invalid/unsupported JSON, timeout and output limits, concurrency, cooldown/backoff, last-good preservation, local request protections, projection/privacy, and DOM interactions. GitHub CI runs lint and tests on Node 22 and 24.

For an actual Chrome smoke check, with the synthetic demo running and `chrome-devtools-axi` already available:

```sh
CHROME_DEVTOOLS_AXI_SESSION=quota-axi-web-test chrome-devtools-axi open http://127.0.0.1:4318
CHROME_DEVTOOLS_AXI_SESSION=quota-axi-web-test chrome-devtools-axi snapshot
```

See [browser validation](docs/validation.md) for the tested viewports and additional failure checks. Never commit captured real reports, account information, credentials, or screenshots containing real quota data.
