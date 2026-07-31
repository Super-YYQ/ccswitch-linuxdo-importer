# v1.2.10 Compatibility and Safety Hardening

Status: ready-for-agent

Target release: v1.2.10

## Problem Statement

CC Switch Importer v1.2.9 successfully parses many linux.do sharing formats, keeps parsing local, masks API keys in its confirmation UI, and has strong parser regression coverage. However, the repository review found several cases where valid-looking input can freeze the browser, silently change or drop imported data, choose the wrong default model, or classify potentially dangerous full configuration as safe.

From the user's perspective, the importer must remain as convenient as v1.2.9 for all currently supported Claude Code and Codex shares while becoming more predictable and defensive:

- Adversarial or malformed text must not freeze the linux.do tab.
- Existing supported inputs must continue producing the same endpoint, API key, application, candidate, and model results unless the old result was demonstrably unsafe or incorrect.
- Official provider deep links must not silently lose recognized fields.
- Unsupported target applications must not be rewritten into Claude Code or Codex providers.
- Exact model IDs must be preserved.
- Full configuration must only be enabled by default when every included field is known to be ordinary provider configuration.
- Every deep link must respect the declared protocol-length limit.
- Documentation must describe the behavior that the userscript actually implements.

## Solution

Release v1.2.10 as a backward-compatible hardening patch for the existing Claude Code and Codex importer.

The parser will use bounded, linear-time scanning for JSON-like content and a consistent bounded-selection strategy. The importer will introduce an explicit safety policy for full configuration, nested environment fields, official deep-link extras, endpoint transport, and unknown fields. Known ordinary provider configuration remains convenient; risky or unknown payloads remain available only through an explicit user opt-in after field-name disclosure.

Official Claude Code and Codex provider deep links will retain recognized CC Switch provider parameters instead of silently dropping them. Provider deep links for applications outside the product's declared scope will be reported as unsupported and will never be rewritten as Claude Code or Codex imports.

Model extraction will preserve exact identifiers, understand the current Claude naming forms, and choose a default according to the selected target application while retaining relay-friendly alternatives in the selector.

The 8,000-character deep-link limit will be enforced at the final construction boundary for every import, regardless of whether a full configuration is attached. The UI will present an actionable error instead of attempting to open or copy an overlong link.

The existing parser suite remains the regression baseline. New behavior will be verified at two agreed high-level seams: the complete import contract and a minimal real-browser userscript flow.

## User Stories

1. As an existing user, I want every v1.2.9 share format that currently works to keep working, so that upgrading does not disrupt my workflow.
2. As an existing user, I want endpoint and API-key extraction to remain unchanged for valid env, JSON, Base64, TOML-like, mixed-text, and provider-deep-link inputs, so that the hardening release is backward compatible.
3. As a linux.do reader, I want malformed text with many unmatched braces to finish parsing quickly, so that a selected post cannot freeze my browser tab.
4. As a linux.do reader, I want oversized selections to have deterministic behavior, so that I understand when I need to select a smaller configuration block.
5. As a user whose configuration appears near the end of a long selection, I want the importer to detect the bounded tail as well as the bounded head, so that head-only truncation does not silently hide my configuration.
6. As a user, I want an explicit oversized-selection warning whenever the importer sampled or truncated my text, so that I know the result may be incomplete.
7. As a user, I want exact Claude model IDs preserved, so that a pinned snapshot is not silently changed into a moving alias.
8. As a user, I want current dateless Claude model IDs recognized, so that modern Claude providers import the intended model.
9. As a user, I want supported Claude model families recognized without requiring a release for every minor spelling variation, so that model detection ages more gracefully.
10. As a Codex user, I want a GPT, o-series, or Codex-family model preferred when the selected text contains both Claude and Codex-oriented models, so that the automatic default matches my target application.
11. As a Claude Code user, I want a Claude-family model preferred when the selected text contains several model families, so that the automatic default matches my target application.
12. As a relay user, I want non-preferred detected models to remain available in the model selector, so that mixed-vendor relays continue to work.
13. As a user who manually chose a model, I want that selection retained while it remains valid, so that rerendering or switching candidates does not override my decision.
14. As a user importing `CLAUDE_*` environment variables, I want those structured variables treated as Claude Code signals, so that model-text cleanup does not erase the application classification.
15. As a user importing an ambiguous relay, I want the importer to continue requiring an explicit Claude Code or Codex choice, so that hardening does not introduce aggressive misclassification.
16. As a user importing an official Claude Code or Codex provider deep link, I want all recognized safe provider parameters retained, so that the importer does not silently discard configuration.
17. As a user importing a provider deep link containing risky optional parameters, I want their field names disclosed and their inclusion disabled by default, so that I make an informed decision.
18. As a user importing a provider deep link for Gemini, OpenCode, OpenClaw, Hermes, or another unsupported application, I want a clear unsupported-app message, so that the importer does not rewrite it into the wrong application.
19. As a user importing a provider deep link with an absent or unrecognized application, I want the importer to distinguish ambiguity from an explicitly unsupported application, so that I receive correct guidance.
20. As a user, I want the importer to preserve safe official fields such as notes, homepage, icon, and enabled state, so that round-tripping a supported deep link is not lossy.
21. As a security-conscious user, I want scripts, commands, hooks, executable configuration, remote configuration URLs, and unknown deep-link parameters treated as risky, so that they require explicit opt-in.
22. As a security-conscious user, I want nested configuration fields inspected recursively, so that dangerous content cannot avoid detection by moving below the top level.
23. As a security-conscious user, I want process-affecting environment variables such as `NODE_OPTIONS`, `BASH_ENV`, `ENV`, `LD_PRELOAD`, and executable path overrides treated as risky, so that they are not imported by default.
24. As a user importing an ordinary provider env block, I want known base URL, API key, auth token, and model variables to remain enabled by default, so that the safe common case stays convenient.
25. As a user, I want unknown environment variables disclosed by name and disabled by default, so that new or unexpected fields fail safely.
26. As a user, I want API-key and token values to remain masked in the userscript UI, so that the hardening work does not expose secrets.
27. As a user, I want opening an import to continue avoiding automatic clipboard writes, so that a secret-bearing deep link is not copied without my request.
28. As a user, I want manual copying to remain available after explicit action, so that I still have a fallback when custom-protocol registration fails.
29. As a user, I want non-loopback plain-HTTP endpoints called out with a strong warning, so that I understand the API key could travel over an unencrypted connection.
30. As a local-proxy user, I want loopback HTTP endpoints to remain supported, so that existing CC Switch and local relay workflows are not blocked.
31. As a user, I want malformed URLs, credential-bearing URLs, and non-HTTP protocols rejected or clearly blocked, so that invalid endpoint text does not become an import.
32. As a user, I want every generated deep link limited to 8,000 characters, so that the importer does not attempt a protocol launch that is known to be unreliable.
33. As a user, I want an overlong deep link to produce an actionable explanation, so that I can remove full configuration or shorten the selection.
34. As a keyboard user, I want the confirmation dialog to receive focus, identify its title, keep focus within the dialog, close with Escape, and restore focus when closed, so that the import flow is usable without a mouse.
35. As a screen-reader user, I want warnings and errors exposed through appropriate dialog and live-region semantics, so that safety decisions are perceivable.
36. As a maintainer, I want the public parsing and deep-link behavior covered at a single import-contract seam, so that implementation refactoring does not force test rewrites.
37. As a maintainer, I want the userscript's critical UI behavior exercised in a real browser, so that DOM, Selection, Shadow DOM, and model-selection defects are not hidden by Node-only tests.
38. As a maintainer, I want tests to assert external results and visible behavior rather than internal helper calls, so that the implementation can remain simple.
39. As a maintainer, I want all existing 102 tests retained and passing, so that v1.2.10 demonstrates backward compatibility.
40. As a maintainer, I want model and provider compatibility fixtures to use synthetic secrets, so that tests and logs cannot trigger secret scanning or expose credentials.
41. As a maintainer, I want performance regression coverage for maximum-size malformed input, so that the quadratic parser behavior cannot return.
42. As a maintainer, I want the README, approved design notes, and release notes to agree on clipboard fallback, model ordering, supported applications, and size limits, so that users receive one consistent contract.
43. As a release manager, I want the version embedded in package metadata, the userscript header, the release tag, and the release artifact to agree on v1.2.10, so that auto-update remains deterministic.
44. As a release manager, I want publishing to continue through the existing tag-triggered guarded workflow, so that the release branch cannot be downgraded or overwritten with different same-version content.
45. As a release manager, I want the generated artifact built from the tagged source rather than a stale ignored local artifact, so that the published userscript contains every v1.2.10 fix.

## Implementation Decisions

- This is a patch release. Valid v1.2.9 Claude Code and Codex inputs are compatibility fixtures and must retain their current endpoint, API key, candidate ordering, and application result unless a fixture captures one of the reviewed defects.
- The parser core remains the product's import-contract boundary. Parsing, normalization, safety classification, and deep-link construction may use internal helpers, but consumers continue to receive one normalized provider result.
- JSON-like object extraction will use a single bounded scanner that tracks nesting, strings, and escapes. It must not restart a full suffix scan for every opening brace.
- Selection work remains capped at 64 KiB. When the original selection is larger, the bounded representation will preserve both its head and tail with an explicit non-data separator and will always add an oversized-selection warning. If neither sampled region contains a complete configuration, the UI will ask the user to select a smaller block.
- The result model will distinguish a missing or ambiguous application from an explicitly unsupported application found in an existing deep link.
- Product support remains Claude Code and Codex. v1.2.10 will not add management UI or generated imports for other CC Switch applications.
- An existing provider deep link for an unsupported application will not be rewritten, copied, or opened as Claude Code or Codex by the importer.
- Recognized official provider parameters will be parsed into typed core fields plus a disclosed collection of optional provider fields. Known parameter ordering is not semantically significant, but names and decoded values must survive a supported round trip.
- Ordinary optional provider metadata is preserved by default. Executable fields, remote configuration fields, usage credentials or access tokens, and unknown fields are categorized as sensitive or risky and require explicit inclusion.
- The same disclosure and inclusion policy applies to optional deep-link fields and full configuration. The UI will present field names, nested env names, byte size, and risk reasons without displaying secret values.
- Full JSON configuration will be inspected recursively within existing size limits. Recursive inspection will have an explicit depth and field-count budget to prevent another denial-of-service path.
- Known ordinary provider environment variables include the existing Anthropic, Claude, OpenAI, Codex, base-URL, API-key, auth-token, and model families. Unknown env names are not automatically trusted.
- Process-control, executable-loading, shell-startup, dynamic-library, path-override, command, script, hook, eval, exec, and remote-fetch semantics are risky regardless of nesting.
- A configuration containing only known ordinary provider fields continues to default to included. A configuration containing any risky or unknown field defaults to excluded but remains available through an explicit checkbox.
- The safety decision is recalculated whenever the user changes candidates or payload inclusion. A prior checkbox state must not silently carry over to a different payload with greater risk.
- Endpoint validation will use URL parsing, not only a prefix regular expression. Only HTTP and HTTPS are valid endpoint protocols.
- Loopback HTTP remains allowed without a blocking error. Non-loopback HTTP remains importable for backward compatibility but receives a prominent warning. URLs containing embedded user credentials are blocked.
- Exact detected model text is preserved. Normalization may standardize casing for known case-insensitive informal spellings, but it must not remove snapshot dates or convert a fixed ID into an alias.
- Claude model recognition will cover current Haiku, Sonnet, Opus, Fable, and Mythos naming forms while retaining the existing legacy Claude 3 and Claude 4 fixtures.
- Model-family preference is application-aware: Claude-family first for Claude Code; GPT, o-series, or Codex-family first for Codex. Other detected models remain in stable document order after preferred families.
- A valid prior explicit model selection wins over automatic preference. If it is no longer present, automatic preference is recalculated.
- Structured provider signals are classified before free-text model tokens are removed. Free-text cleanup must not delete `CLAUDE_*`, `ANTHROPIC_*`, `OPENAI_*`, or `CODEX_*` configuration keys.
- Deep-link length validation is centralized at the final construction boundary and applies to opening and copying. A result longer than 8,000 characters is never launched or copied.
- Overlong fields are not silently truncated. The user receives a field-oriented error and can disable optional/full configuration or select a smaller input.
- The open action continues to avoid automatic clipboard fallback because the deep link contains secrets. Documentation and legacy design notes will be updated to describe manual copying only.
- The confirmation dialog will gain focus management and accessible labeling without changing the visual interaction sequence.
- The source may introduce small pure policy helpers for model choice, payload risk, and final validation. A broad parser-module split or UI rewrite is not required for v1.2.10.
- The existing tag-triggered release workflow remains the only publication mechanism. The implementation flow will bump the package version, run the agreed verification, commit, tag `v1.2.10`, push the source branch and tag, and let the guarded workflow publish the release artifact.

## Testing Decisions

- Tests assert externally observable parsing results, safety decisions, generated deep-link parameters, visible UI state, and release artifacts. They must not assert private helper structure or exact implementation algorithms.
- The first agreed seam is the complete import contract: source share text enters the parser and the test observes normalized fields, risk disclosure, inclusion defaults, selected application/model policy, and the final provider deep link.
- Existing parser, model-extractor, release-guard, and format-variant tests are prior art for the import-contract seam. Their synthetic fixture style and secret masking remain mandatory.
- All existing tests must pass unchanged unless a test explicitly encodes one of the reviewed defects. Any changed expectation must be called out in the implementation record.
- Add a maximum-size unmatched-brace case that completes within one second in supported Node CI and returns no result instead of hanging.
- Add balanced nested-object, quoted-brace, escaped-quote, many-object, and unclosed-string cases to validate scanner correctness.
- Add oversized-selection cases with configuration in the head, configuration in the tail, and configuration only in the omitted middle. Head and tail cases parse with a warning; the omitted-middle case fails with guidance.
- Add recursive-risk cases for safe env-only configuration, unknown env names, process-control env names, nested script/command fields, excessive depth, excessive field count, and risky deep-link extras.
- Add supported provider-deep-link round trips for every currently documented provider parameter category. Safe recognized parameters survive; risky parameters are disclosed and follow the explicit inclusion choice.
- Add unsupported-app provider-deep-link cases for at least Gemini, OpenCode, and OpenClaw. None may be rewritten to Claude Code or Codex.
- Add exact model fixtures for dated minor snapshots, dateless minor IDs, major-only IDs, current Claude families, mixed Claude/Codex lists, relay-only non-preferred models, and manual-selection retention.
- Add structured `CLAUDE_*` and mixed-provider environment cases to validate application classification before model-token cleanup.
- Add final-length cases where the excess originates independently from full config, provider name, endpoint, API key, optional metadata, and combined parameters.
- Add endpoint cases for HTTPS, loopback HTTP, non-loopback HTTP, credentials in the authority, malformed URL text, and non-HTTP protocols.
- The second agreed seam is a minimal real-browser userscript flow using the built artifact in a synthetic page. It will exercise Selection, the floating trigger, Shadow DOM confirmation card, target-app switching, model default changes, payload checkbox state, keyboard focus, Escape, manual copy stubbing, and protocol-open stubbing.
- The browser test will not launch CC Switch and will not place a real secret on the system clipboard. Custom-protocol and clipboard APIs are stubbed at the browser boundary.
- At least Chromium is required for the release gate. Firefox coverage should be added when it can run without making the patch release unreliable; lack of Firefox automation does not permit removing the existing Firefox support claim without a separate decision.
- Build verification checks that the generated userscript is a single IIFE, contains v1.2.10 metadata, targets the release branch for update/download, contains no module exports, and is built from current source.
- Release verification checks that the v1.2.10 tag points to the intended source commit, the guarded workflow succeeds, the release branch artifact reports v1.2.10, and the GitHub Release asset is present.

## Out of Scope

- Adding first-class Gemini, OpenCode, OpenClaw, Hermes, or other application import support.
- Changing the CC Switch deep-link protocol or modifying CC Switch itself.
- Automatically testing whether the operating system has registered the `ccswitch://` protocol.
- Automatically copying a secret-bearing deep link after a protocol no-op.
- Removing manual deep-link copying.
- Uploading, validating, or probing provider credentials against remote endpoints.
- Replacing the heuristic share parser with a general configuration language parser.
- A broad rewrite or full source-module decomposition of the parser and UI.
- Moving the full historical change summary into a separate changelog file.
- Dropping old development Node versions, changing the CI support matrix, or upgrading the build tool solely for maintenance reasons.
- Changing release-branch ownership, permissions, or the existing guarded tag publication architecture.
- Supporting selections larger than the bounded 64 KiB processing budget without sampling.

## Further Notes

- The compatibility baseline is v1.2.9 and its 102 passing tests.
- The declared product target remains linux.do selections imported into CC Switch for Claude Code or Codex.
- The official CC Switch provider deep-link documentation is the source of truth for recognized provider parameter names and supported application identifiers.
- Anthropic's model-ID and versioning documentation is the source of truth for preserving dated snapshots versus aliases.
- CC Switch provides its own import confirmation, but v1.2.10 retains the userscript confirmation as the first local safety boundary.
- The ignored local userscript artifact is not a release source of truth. Publication must use a fresh artifact built by the release workflow from the v1.2.10 tag.
- After this specification is approved, it contains multiple independently verifiable units and should be decomposed with `to-tickets` before implementation.
