# Legal content audit — 2026-08-04

Point-in-time audit of every legal document, consent mechanism, and attribution surface in
the repo, verified **against the code**, not against the docs. Where `docs/` and the code
disagreed, the code won and the disagreement is recorded as a finding.

Closes the open item that was at `docs/issues.md:25` ("re verify all legal related
content").

---

## Status: all findings remediated (2026-08-04)

Every finding below has been fixed in the same session. **This document is kept as the
historical record of the pre-fix state** — the resolution log is §8, and the ongoing rules
that came out of it live in [compliance-documents.md](compliance-documents.md).

Two reading notes:

- **EULA section numbers below refer to the old document.** The fix inserted Pre-release
  (§3), Indemnification (§11), and Time limit on claims (§12), which shifted everything
  after them. Old §3 (AI output) is now §4, old §6 (third-party) is now §7, old §8/§9 (no
  warranty / liability) are now §9/§10, and the Contact block is now a numbered §18.
- **§0 is deliberately not resolved.** Incorporation was considered and declined for now:
  Anchor is a portfolio project, built with the option of becoming more later. That
  decision is recorded, not overridden — the exposure it describes is real and unchanged,
  and it should be revisited before Paid Features take money. Everything textual that can
  reduce that exposure has been done.

Verification for this pass: 606 frontend tests across 52 files, 58 Rust tests, `tsc
--noEmit` clean on both packages, `cargo check` clean (which is what validates
`tauri.conf.json`, since `bundle` is `deny_unknown_fields`), and both `npm run build`s
succeeding.

---

## 0. On the goal: "cannot be held liable whatsoever and cannot be sued"

That outcome is not reachable by drafting, and no document in this repo can deliver it.
Anyone can file a claim regardless of what the EULA says; and every jurisdiction you ship
to voids some exclusions by statute — Ontario's *Consumer Protection Act, 2002* (s. 9(1)
implied warranties, s. 7 no-contracting-out), the EU Sale of Goods/Digital Content
Directives, UK CRA 2015, Australian Consumer Law. The EULA already acknowledges this
correctly in §8 and §9 ("Nothing in this Agreement excludes or limits liability that
cannot be excluded…"). That carve-out is the right drafting and should stay.

What is achievable is (a) making a claim expensive, weak, and capped, and (b) keeping any
judgment away from your personal assets. On (b), the highest-leverage action in this whole
audit is not a clause:

> **Anchor is published by a named individual.** `LICENSE`, `NOTICES.md`, `EULA.md`,
> `PRIVACY.md`, and both site footers all name "Aiden Paleczny" personally as licensor and
> publisher. There is no corporate veil. Every liability the documents fail to exclude
> lands on you personally. Incorporating (an Ontario corporation or ULC) and re-issuing the
> documents with the corporation as licensor does more for your stated goal than any
> combination of clauses below. Do that before the Microsoft Store listing goes live and
> before you take money for Paid Features (EULA §2).

The rest of this report is the achievable part. I am not a lawyer and this is not legal
advice; the drafting gaps in §5 are the ones worth putting in front of one.

---

## 1. Where the legal content actually lives

Verified map. Single source of truth is `docs/legal/` + `NOTICES.md`, imported as `?raw`
strings by both the app and the website, so all three surfaces render byte-identical text.
That design is sound and is working.

| Document | Source of truth | App surface | Website surface |
|---|---|---|---|
| EULA / Terms | [docs/legal/EULA.md](legal/EULA.md) | `/legal/terms` + setup wizard tab | `/terms` |
| Privacy Policy | [docs/legal/PRIVACY.md](legal/PRIVACY.md) | `/legal/privacy` + setup wizard tab | `/privacy` |
| Third-party notices | [NOTICES.md](../NOTICES.md) | `/legal/notices` | `/licenses` |
| Source licence | [LICENSE](../LICENSE) (Elastic 2.0) | footer text only | footer text only |
| Security / AI-output / takedown contact | [SECURITY.md](../SECURITY.md) | — | — |

Wiring, all verified:

- [app/src/features/legal/legalContent.ts:6-8](../app/src/features/legal/legalContent.ts#L6-L8) and
  [website/src/legal/legalContent.ts:4-6](../website/src/legal/legalContent.ts#L4-L6) import the same files.
- Consent gate: [App.tsx:63-76](../app/src/App.tsx#L63-L76) withholds the entire router until
  the EULA is accepted **and** setup is complete. [SetupWizard.tsx:47-53](../app/src/features/setup/SetupWizard.tsx#L47-L53)
  orders `terms` ahead of `install` on every path, so nothing is downloaded or executed
  before acceptance. `startAutomatic` ([SetupWizard.tsx:103-108](../app/src/features/setup/SetupWizard.tsx#L103-L108))
  honours the same ordering. **This is correct and is the strongest part of the setup.**
- Clickwrap is affirmative: explicit checkbox **plus** a Continue click
  ([TermsStep.tsx:105-138](../app/src/features/setup/steps/TermsStep.tsx#L105-L138)), and the
  checkbox label independently restates the AI-inaccuracy disclaimer rather than relying
  only on incorporation by reference. Good.
- Storage fails closed: if `localStorage` throws, `hasAcceptedCurrentEula()` returns
  `false` and the gate shows ([eulaAcceptance.ts:15-23](../app/src/features/legal/eulaAcceptance.ts#L15-L23)).
- Discoverable post-install from both [Settings.tsx:396-423](../app/src/pages/Settings.tsx#L396-L423)
  (which also displays the acceptance date) and [About.tsx:397-426](../app/src/pages/About.tsx#L397-L426).
- Relative cross-references inside the markdown (`[Privacy Policy](PRIVACY.md)`) are
  rewritten per-surface to `#/legal/privacy` / `/privacy`, so no legal document renders a
  broken link in either shell. Verified in both `Markdown.tsx` renderers.
- Website legal URLs are emitted as real static files by the `prerenderLegalRoutes` plugin
  ([website/vite.config.ts:20-38](../website/vite.config.ts#L20-L38)), so `/privacy`, `/terms`,
  `/licenses` return 200 on any static host with no redirect config. Good.

---

## 2. High-severity findings

### H1 — The website ships visitor IP addresses to Google, and the Privacy Policy says it doesn't

[website/index.html:21-30](../website/index.html#L21-L30) loads Inter, Source Serif 4, and
Material Symbols from `fonts.googleapis.com` / `fonts.gstatic.com`, with `preconnect` hints
that fire before the stylesheet even parses.

`PRIVACY.md` §4 describes the site as:

> a static site with **no accounts, no analytics scripts, no advertising, and no tracking
> cookies**. Its hosting infrastructure receives standard server-log metadata…

It never discloses that every visit transmits the visitor's IP address, user-agent, and
referring page to a third party (Google LLC, US). That is a material omission, not a
technicality: dynamically-loaded Google Fonts without disclosure or consent is the exact
fact pattern in *LG München I*, 3 O 17493/20 (20 Jan 2022), which awarded damages to a
site visitor. The policy also invokes the GDPR by name in §6, which invites the comparison.

The irony worth noting: `LegalPage.tsx` is served from this same `index.html`, so the
Privacy Policy page itself performs the undisclosed transfer while denying it.

The app is clean here — fonts are self-hosted via npm and `font-src 'self'` in the CSP
([tauri.conf.json](../app/src-tauri/tauri.conf.json)) enforces it. Only the website is affected.

**This exact problem was already found and fixed — on one of the two surfaces.**
`docs/issues.md:144-152` records it as resolved: *"The app fetched its fonts from Google on
every launch, contradicting the on-device claim"*, closed by bundling
`@fontsource-variable/inter`, `@fontsource-variable/source-serif-4` and `material-symbols`
and importing them from `main.tsx`, with both Google origins dropped from the CSP. The
website kept the original `<link>` tags. So the repo already contains the fix, the
motivation for it, and the working pattern — it was applied to the app and not carried
across.

**Fix (preferred):** repeat that change in `website/`. Add the three packages to
`website/package.json`, import them in `website/src/main.tsx` exactly as
[app/src/main.tsx:9-11](../app/src/main.tsx#L9-L11) does, and delete the four
`<link>`/`preconnect` tags. Note the same gotcha the app hit: Fontsource registers the
families as `Inter Variable` / `Source Serif 4 Variable`, and the self-hosted Material
Symbols is the *full* variable font rather than the instanced one Google served, so
`website/src/theme.css` needs the same font-token and axis-pinning treatment `App.css`
received. This removes the disclosure problem instead of documenting it, and makes the
policy true as written. Second-best is to amend §4 to disclose Google as a recipient —
worse, because it makes an otherwise genuinely clean privacy story messy.

### H2 — `NOTICES.md` is incomplete, and two documents represent that it is complete

`NOTICES.md` was last regenerated 2026-07-13 and has drifted. Missing:

**Fonts — no attribution anywhere in the file (grep for `SIL`, `OFL`, `Source Serif`,
`Material Symbols`, `fontsource` returns zero hits):**

| Bundled component | Imported at | Expected licence |
|---|---|---|
| Inter (variable) | [main.tsx:9](../app/src/main.tsx#L9) | SIL OFL 1.1 |
| Source Serif 4 (variable) | [main.tsx:10](../app/src/main.tsx#L10) | SIL OFL 1.1 |
| Material Symbols Outlined | [main.tsx:11](../app/src/main.tsx#L11) | Apache-2.0 |

These are shipped WOFF2 binaries inside the installer — `docs/issues.md:14` independently
confirms the 4 MB Material Symbols font is in the installer. **SIL OFL 1.1 requires the
copyright notice and the full licence text to accompany the font files.** Shipping them
with no notice is an actual licence breach, not a paperwork gap. OFL 1.1 is also not among
the licence texts in Appendices A–D, so a new appendix is needed.

**Packages/crates:** `@tauri-apps/plugin-clipboard-manager` is absent from §2, and 18
crates present in `Cargo.lock` are absent from §3 — every one of them reachable from
`tauri-plugin-clipboard-manager`, which was added to
[Cargo.toml:41](../app/src-tauri/Cargo.toml#L41) after the last regeneration:

```
arboard, clipboard-win, downcast-rs, error-code, fixedbitset, gethostname,
petgraph, tauri-plugin-clipboard-manager, tree_magic_mini, wayland-backend,
wayland-client, wayland-protocols, wayland-protocols-wlr, wayland-scanner,
wayland-sys, wl-clipboard-rs, x11rb, x11rb-protocol
```

Several (`wayland-*`, `x11rb*`, `wl-clipboard-rs`) are Linux-only and will not compile into
the Windows/macOS builds; `arboard`, `clipboard-win` (Windows), `error-code` (Windows),
`downcast-rs`, and `tree_magic_mini` do ship. Rather than resolve that by hand, regenerate
with `cargo metadata --filter-platform` per target — which also picks up the correct
licence strings (I could not run `cargo metadata` offline to verify them, so treat the
licences as needing confirmation at regeneration time; note `clipboard-win` and
`error-code` are BSL-1.0, already covered by Appendix D's identifier list).

Why this is high and not medium: two separate documents assert the file is complete.
`EULA.md` §6 tells users third-party terms are "reproduced in the App's **Licenses &
Notices** screen and in the repository's `NOTICES.md`", and `docs/release.md:371` records
Microsoft Store policy **11.2** (third-party components properly licensed and attributed)
as ✅ on the strength of it. Both are currently inaccurate.

### H3 — The recorded consent version does not match the document users are shown

[legalContent.ts:15](../app/src/features/legal/legalContent.ts#L15) declares:

```ts
export const EULA_VERSION = '2026-07-20';
```

Both `EULA.md:3` and `PRIVACY.md:3` say **July 23, 2026**. The comment three lines above the
constant states the invariant explicitly: *"Must match the EULA's effective date… Keep in
sync with the 'Effective date' line in EULA.md."*

Git shows this broke at birth: commit `0366c8d` ("Add legal document viewer and
navigation") bumped the effective date from July 20 → July 23 **and** introduced the
constant hard-coded to the pre-bump date in the same commit.

Two consequences:

1. **Evidentiary.** `eulaAcceptance.ts` exists specifically to produce a defensible consent
   record — its own header says a disclaimer "is far more defensible when tied to a
   recorded, affirmative acceptance". Right now every record written says the user accepted
   `2026-07-20`, a version of the document that is not the one they were shown and that no
   longer exists in the repo. That is the one artefact you would produce to prove consent,
   and it names the wrong document.
2. **Operational.** The re-consent mechanism keys off this string. The July 23 revision
   shipped without re-prompting anyone who had accepted the July 20 text.

**Fix:** set `EULA_VERSION = '2026-07-23'`, and add the test that would have caught it (see
L6). Bumping it also re-prompts existing users, which is the correct outcome for a revision
that already shipped silently.

### H4 — There is no indemnification clause

The EULA has a warranty disclaimer (§8) and a liability cap (§9), and both are competently
drafted. Neither addresses the scenario that actually reaches you: **a third party sues
you because of what a user did with Anchor.**

§4 and §5 place responsibility on the user for having rights to the documents they process
and for complying with privacy law — but they create no obligation to defend or reimburse
you. So if a user runs a stack of other people's medical records through Anchor and the
data subjects come after the tool's publisher, §8 and §9 (which bind *that user*, not the
claimants) do nothing, and you fund your own defence personally (see §0).

This is the single largest substantive gap for your stated goal. A standard clause — user
defends, indemnifies, and holds harmless against third-party claims arising from their
documents, their use, and their breach of §4/§5 — belongs as a new §10. Note it will be
unenforceable or narrowed against consumers in several jurisdictions; it is still worth
having, because it works against the commercial users you are actually targeting
(registrar offices, accounting firms) and costs nothing against the rest.

---

## 3. Medium-severity findings

### M1 — Shipped binaries carry no copyright or publisher metadata

[tauri.conf.json](../app/src-tauri/tauri.conf.json) `bundle` sets only `active`, `targets`,
`icon`, `resources`. Missing: `copyright`, `publisher`, `licenseFile`, `shortDescription`,
`longDescription`.

- No `bundle.copyright` → the Windows EXE's *Legal Copyright* property and macOS
  `NSHumanReadableCopyright` are both empty. The one place a copyright notice travels with
  the binary regardless of what the user reads.
- No `bundle.publisher` → falls back to a value derived from the identifier
  (`com.aidenpaleczny.anchor`) rather than the legal name used everywhere else.
- No installer `licenseFile` → the NSIS/WiX installer displays no licence.

Compounding it, [Cargo.toml:4-5](../app/src-tauri/Cargo.toml#L4-L5) still holds the Tauri
template placeholders `description = "A Tauri App"` and `authors = ["you"]`. Contrast
`app/package.json`, which is correct (`author: Aiden Paleczny <…>`, `license: Elastic-2.0`).
Fix before the Store submission — `publisher` must match your Partner Center identity.

### M2 — No capacity clause, and no beta/pre-release clause

- **Capacity.** Nothing in the EULA requires the accepting party to be of the age of
  majority or otherwise able to contract. A contract accepted by a minor is voidable at
  their option — which would take the §8/§9 protections with it. One sentence in §1 fixes
  it. (`PRIVACY.md` §5 says the app is not directed at children, but that is a data
  statement, not a capacity condition.)
- **Beta.** The site runs a prominent "Anchor is in beta" strip
  ([App.tsx:704-712](../website/src/App.tsx#L704-L712)), all three GitHub releases are flagged
  pre-release (`docs/release.md:26`), and both download cards say "Unsigned for now". The
  EULA never mentions pre-release status. An express pre-release clause — expect defects,
  no support commitment, do not use in production-critical workflows — reinforces §8 with
  the thing you are already telling users on the site, and is easy for a claimant to argue
  you omitted deliberately if it stays missing.

### M3 — The survival clause omits the sections that need to survive

§10: *"Sections 3, 4, 8, 9, 11, and 13 survive termination."*

Omitted: **§14** (severability, entire agreement, no-waiver, assignment) and **§12**
(website terms — website use continues after the app is uninstalled). §14 is the section
that keeps §8 and §9 standing if part of the agreement is struck down; excluding it from
survival is self-defeating. §2's anti-circumvention and no-resale terms are also
conventionally survived.

### M4 — Privacy Policy gaps where it invokes the GDPR

§6 expressly reaches for GDPR legitimate interest, which sets the bar the rest of the
document is then measured against. Against that bar:

- **No retention period.** §2 says "short-lived operational logs". Art. 13(2)(a) wants a
  period or the criteria used to determine it. Cloudflare's own retention is a number you
  can state.
- **Cloudflare is not named as a processor.** §2 says "operated on Cloudflare
  infrastructure" but never identifies Cloudflare as a recipient/processor, and there is no
  international-transfer basis (Art. 13(1)(f)) despite the data leaving the EU.
- **No right to complain to a supervisory authority** (Art. 13(2)(d)). Required whenever
  GDPR applies, even where you hold nothing.
- No CCPA/CPRA "we do not sell or share personal information" line. Low risk given you
  genuinely collect nothing, but it is one sentence.

These are cheap to close and the underlying privacy posture is genuinely excellent (see §6),
so the document currently undersells a strong position.

### M5 — `docs/compliance-documents.md` does not exist

Referenced as authoritative from four places:
[app/vite.config.ts:34](../app/vite.config.ts#L34),
[app/src/features/legal/legalContent.ts:2](../app/src/features/legal/legalContent.ts#L2),
[website/vite.config.ts:45](../website/vite.config.ts#L45),
[website/src/legal/legalContent.ts:3](../website/src/legal/legalContent.ts#L3), plus
`docs/release.md:9`, which describes it as "the legal-document inventory". `docs/legal/`
contains only `EULA.md` and `PRIVACY.md`.

Every "single source of truth" comment in the codebase cites a §2 that cannot be read.
Either write the inventory or repoint the five references at this audit.

### M6 — Three copyright-year rules, three different answers

| Location | Rule | Output in 2027 | With a clock skewed to 2025 |
|---|---|---|---|
| [app/src/utils/copyright.ts:20-23](../app/src/utils/copyright.ts#L20-L23) | `current <= FOUNDED_YEAR` | `2026-2027` | `2026` |
| [website/src/App.tsx:1031](../website/src/App.tsx#L1031) | `FOUNDED_YEAR === getFullYear()` | `2026-2027` | `2026-2025` ← backwards |
| [website/src/LegalPage.tsx:74](../website/src/LegalPage.tsx#L74) | hard-coded `© 2026` | `2026` ← stale | `2026` |

`copyright.ts` documents the invariant it is supposed to hold to: *"Mirrors the website
footer's rule (website/src/App.tsx) so the two never disagree about the same claim."* They
disagree. The app deliberately uses `<=` to survive a skewed client clock; the website uses
`===` and will print a reversed range. And `LegalPage.tsx` — the footer on the *legal*
pages specifically — is frozen at 2026 and omits the "Licensed under the Elastic License
2.0" line the marketing footer carries.

Extract one shared helper (or at minimum copy the `<=` rule into both website call sites).

---

## 4. Low-severity findings

| # | Finding |
|---|---|
| L1 | [eulaAcceptance.ts:9](../app/src/features/legal/eulaAcceptance.ts#L9) points readers at `FirstRunEula.tsx`, which does not exist. The consent UI is `features/setup/steps/TermsStep.tsx`. |
| L2 | `/notices` is registered as an alias in [legalRoutes.ts:19-21](../website/src/legal/legalRoutes.ts#L19-L21) but `prerenderLegalRoutes` only emits files for `LEGAL_ROUTE_PATHS`. A direct visit to `anchor.aidenpaleczny.com/notices` 404s; it only works as an in-session client-side navigation. Emit the aliases too, or drop them. |
| L3 | The consent record lives only in webview `localStorage`, and [appDataActions.ts:51](../app/src/features/settings/appDataActions.ts#L51) calls `localStorage.clear()` on "remove all app data" — deliberately, and it is the right call for a "remove everything" promise. But it means the consent audit trail is user-erasable and per-webview-origin. If you want a durable record, write acceptance (version + ISO timestamp) to a file in the app-data dir alongside the localStorage copy. |
| L4 | [app/index.html:10](../app/index.html#L10) still reads `<title>Data Extraction Tool</title>` — the pre-rename product name. Low impact (Tauri overrides the window title from `tauri.conf.json`), but it is the old identity shipping in the bundle. |
| L5 | `e2e/specs/setup.e2e.ts` has zero coverage of the consent gate — no assertion that the wizard cannot reach `install` without acceptance. The unit tests in `TermsStep.dom.test.tsx` cover the copy thoroughly but not the gate ordering end-to-end. This is the one behaviour where a regression is a compliance failure rather than a bug. |
| L6 | No test asserts `EULA_VERSION` matches the `Effective date` line in `EULA.md`. A three-line test parsing the date out of the imported markdown would have caught H3 at the commit that introduced it. Add it with the H3 fix. |
| L7 | The website's download CTAs link straight to GitHub Releases with no "by downloading you agree to the Terms" reference; Terms appear only in the footer. The in-app clickwrap is the real gate so this is not a hole, but the line strengthens the formation chain for the non-Store path. |
| L8 | EULA §12 says "see the contact in Section 14" — §14 is *General*; the **Contact** line sits unnumbered after it. Either number the contact block or point §12 at it directly. |

---

## 5. Substantive clauses that do not exist

Beyond H4 (indemnification) and M2 (capacity, beta), the following are absent. Ranked by
what they would actually buy you:

1. **Limitation of actions** — "any claim must be brought within one year of the events
   giving rise to it". Cheap, widely enforced against non-consumers, and cuts off the long
   tail where a data error surfaces years later. Nothing equivalent exists today.
2. **"Not professional advice"** — §3 tells users to verify output and lists the
   high-stakes domains (financial, accounting, tax, medical, legal, safety, regulatory) but
   never says Anchor is not a substitute for professional judgement in them. Given the
   website's lead use cases are transcripts, invoices, statements and lab results, the
   explicit disclaimer is worth its two lines.
3. **Class-action waiver / arbitration** — the strongest available tool against aggregated
   consumer claims in the US. Genuinely double-edged: Ontario's CPA s. 7-8 voids
   arbitration clauses for consumer claims, and the EU treats them as unfair terms, so it
   buys nothing in your home jurisdiction and may read as overreach. Worth raising with a
   lawyer rather than adopting by default.
4. **"Regardless of the theory of liability"** — §9 is broad ("arising out of or related
   to") but does not enumerate contract, tort, negligence, strict liability, or statute.
   Enumerating is standard and closes an argument.
5. **No third-party beneficiaries** — prevents a non-party (e.g. someone whose data was in
   a user's document) from claiming rights under the agreement.
6. **Force majeure** — least important here, since you promise no availability or support
   (§7). Include for completeness only.

Also note §2 grants a **perpetual** Paid Features licence and commits to a 14-day refund
where no platform policy applies. No licence-key or payment code exists yet (grep for
`licenseKey`/`purchase`/`stripe` across `app/src` and `app/src-tauri/src` returns nothing),
so these are forward commitments. They are fine as drafted, but revisit the refund window
and the perpetual grant when you actually build the paywall — and see §0 about doing that
through a corporation.

---

## 6. What is correct — do not disturb

Recorded so the fixes above don't regress it.

- **The consent gate ordering is right and is enforced in code, not by convention.** Terms
  precede `install` on every path through the wizard, including the one-click automatic
  path, and the app itself is withheld until acceptance. This is the finding I most
  expected to break and it holds.
- **Single-source legal text genuinely works.** App, website, and repo render byte-identical
  documents from the same files. The Store-linked URL cannot contradict the in-app text.
- **The privacy claims are true against the code.** I traced every outbound call. The only
  non-loopback hosts in the Rust backend are `anchor-assets.aidenpaleczny.com` and
  `huggingface.co` ([setup.rs:24,33,35](../app/src-tauri/src/setup.rs#L24)) — exactly the two
  named in `PRIVACY.md` §2. No updater plugin, no telemetry, no crash reporter, no
  analytics anywhere in the tree. The CSP `connect-src` is restricted to `self`, `ipc:`, and
  `127.0.0.1:*`, so the webview *cannot* call out even if code tried. The "performs no
  update checks" claim is accurate. (The one exception is the **website**, per H1.)
- **The AI-output disclaimer is layered properly** — EULA §3, the clickwrap checkbox text,
  the About page notice, the website footer, and `SECURITY.md`'s `[AI OUTPUT]` report
  channel. This is well above what most shipping apps do and directly supports Store policy
  11.16.
- **`NOTICES.md` §1 is careful work.** The CUDA runtime is correctly identified as
  proprietary-and-redistributable under Attachment A of NVIDIA's EULA; the Qwen licence was
  verified on both the base and quantized repos; the GGUF revision is pinned. The
  Appendices cover Apache-2.0, MIT, BSD-2/3, ISC, zlib, Unicode-3.0, MPL-2.0 and name the
  remaining SPDX identifiers. The gap in H2 is staleness, not carelessness.
- **`SECURITY.md`** covers vulnerability reporting, AI-output reporting (the named Store
  11.16 channel), and copyright/takedown, each with a distinct subject line.
- **Fail-closed consent** on storage errors, and honest per-context wizard copy that
  refuses to promise "nothing downloaded yet" on a re-consent run where the assets are
  already on disk — with tests covering exactly that. Good instinct, well tested.

---

## 7. Suggested order of work

**Before the Microsoft Store submission:**

1. H3 — set `EULA_VERSION = '2026-07-23'`; add the L6 guard test. *(one line + one test)*
2. H1 — self-host the website fonts. *(makes `PRIVACY.md` §4 true as written)*
3. H2 — regenerate `NOTICES.md`; add the three font entries and an OFL 1.1 appendix.
   *(unblocks the EULA §6 and Store 11.2 representations)*
4. M1 — add `bundle.copyright` / `publisher` / `licenseFile`; clear the `Cargo.toml`
   placeholders. *(`publisher` must match Partner Center)*

**Before taking money, or in the same pass with a lawyer:**

5. §0 — incorporate; re-issue all documents with the corporation as licensor.
6. H4 — indemnification clause.
7. M2, M3, and §5 items 1, 2, 4, 5 — capacity, beta, survival, limitation of actions, not-
   professional-advice, theory-of-liability, third-party beneficiaries. All are additive
   edits to `EULA.md`; because the app and site read the same file, a single edit plus an
   `EULA_VERSION` bump propagates everywhere and re-prompts existing users automatically.
8. M4 — Privacy Policy: retention period, Cloudflare as processor, transfer basis,
   supervisory-authority right.

**Housekeeping, any time:** M5, M6, L1–L8.

---

## 8. Resolution log (2026-08-04)

What was actually changed, per finding.

| # | Resolution |
|---|---|
| §0 | **Declined for now** — portfolio project, no incorporation. Exposure unchanged and documented; revisit before Paid Features. |
| H1 | Website self-hosts Inter, Source Serif 4 and Material Symbols (`website/src/main.tsx`); all four Google `<link>`/`preconnect` tags removed from `website/index.html`; `"… Variable"` family names and the four-axis pin added to `theme.css`; `PIN_AXES` guard copied into `website/src/components/Icon.tsx` so the previously-inert `weight={300}` props stay inert and the site looks unchanged. Built `dist/` verified to contain **zero** requests to any external host. |
| H2 | `NOTICES.md` regenerated. New **§2.1** covers the three bundled fonts with their verbatim upstream attributions; new **Appendix E** carries the full SIL OFL 1.1 text. `@tauri-apps/plugin-clipboard-manager` added to §2; the 18 missing crates added to §3. §3 now reconciles against `cargo metadata` by **name and version** — 718 rows, 718 packages, nothing missing, nothing extra, no licence string disagreeing with a crate manifest. Also caught in passing: `quick-xml` was listed at 0.39.4 while the graph carries both 0.39.4 and 0.41.0. |
| H3 | `EULA_VERSION` → `2026-08-04`, matching the amended effective date. |
| H4 | New EULA **§11 Indemnification** — defend/indemnify/hold harmless for the user's documents, use, and breach of §5/§6, with carve-outs for Licensor's fraud or wilful misconduct and for consumers where local law forbids it. |
| M1 | `tauri.conf.json` gains `publisher`, `homepage`, `copyright`, `license`, `licenseFile`, `shortDescription`, `longDescription`; `Cargo.toml` placeholders (`"A Tauri App"`, `authors = ["you"]`) replaced and `license`/`repository`/`homepage` added. Validated by `cargo check` — `BundleConfig` is `deny_unknown_fields`, so a wrong key would fail the build. |
| M2 | New **§3 Pre-release software**; capacity and authority-to-bind added to **§1**. |
| M3 | Survival list rewritten: §§2 (partial), 4, 5, 9, 10, 11, 12, 14, 15, 16, 17. |
| M4 | Privacy Policy names Cloudflare, Inc. as processor, states the SCC transfer mechanism, states that **no log export or analytics is enabled** and that we never receive or retain a copy, adds GDPR/UK-GDPR data-subject rights and the supervisory-authority complaint right, adds a CCPA/CPRA no-sale/no-share statement, and §4 now affirmatively states the site loads no third-party resources (true as of H1). |
| M5 | [compliance-documents.md](compliance-documents.md) written — the inventory the five code comments cite, with §2 as the single-source-of-truth section they point at. |
| M6 | `website/src/copyright.ts` added as a byte-for-byte copy of the app's rule; both website footers now call `copyrightYears()`. The `===` check and the hard-coded `© 2026` are gone. |
| L1 | Stale `FirstRunEula.tsx` reference replaced (`eulaAcceptance.ts` was rewritten for L3). |
| L2 | `ALL_LEGAL_ROUTE_PATHS` exported from `legalRoutes.ts`; the pre-render plugin emits alias routes too. `dist/notices/index.html` now exists. |
| L3 | New `src-tauri/src/consent.rs` (`read_consent_record` / `write_consent_record`) mirrors acceptance to `consent.json` in AppData. `localStorage` stays the synchronous fast path; a lost webview store now heals from disk, and `App.tsx` holds its spinner over the async read so no consent prompt flashes at a user who already consented. A stale on-disk version can never restore consent to revised terms. |
| L4 | `app/index.html` title `Data Extraction Tool` → `Anchor`. |
| L5 | New `Consent gate` e2e suite. Also fixed the pre-existing journey spec, which walked Welcome → progress bar and **never accounted for the consent step at all** — it described a first run that cannot happen. |
| L6 | `legalContent.test.ts` — parses the effective date out of the bundled markdown and fails if `EULA_VERSION` disagrees; also asserts the Privacy date matches, that no `Section N` cross-reference dangles after renumbering, and that the core disclaimers survive a rewrite. Plus `eulaAcceptance.dom.test.ts` for the L3 heal paths. |
| L7 | Download section now names the Terms and Privacy Policy at the point of download, notes the first-launch acceptance, and repeats the verify-AI-output line. |
| L8 | Contact is now numbered **§18**; §15 points at it directly. |

### Also added from §5 (clauses that did not exist)

Limitation of actions (**§12**, one year), not-professional-advice (**§4**), theory-of-
liability enumeration and failure-of-essential-purpose (**§10**), no third-party
beneficiaries and force majeure (**§17**). Governing law (**§16**) reworded to "the laws of
the Province of Ontario and the federal laws of Canada applicable therein".

**Not adopted:** the class-action waiver / arbitration clause. As §5 item 3 notes, Ontario's
CPA s. 7–8 voids arbitration clauses for consumer claims and the EU treats them as unfair
terms, so it buys nothing in the home jurisdiction while reading as overreach. Worth a
lawyer's view rather than a default.

### Follow-up this created

Self-hosting on the website means the **full 4 MB Material Symbols font is now served to
every visitor**, not just shipped in the installer. Correctness beat weight here — the
alternative was leaking visitor IPs to Google — but subsetting it to the ~80 glyphs
actually used is now worth more than it was. Logged in `docs/issues.md`.
