# Chrome / Helium Port: Findings and Plan

Status as of 2026-10-13. "Verified" means tested in this repo against Chromium
141 (Playwright's bundled build); everything else is from research and is
cited.

## Summary

- **Target MV3, not MV2.** Helium does still load MV2 extensions (it carries
  ungoogled-chromium's `extensions-manifestv2.patch`), but Chromium gates the
  `sidePanel` and `tabGroups` APIs to MV3. An MV2 build therefore has no
  sidebar and no tab groups even on Helium, and upstream Chromium is actively
  removing MV2 code.
- **An MV3 port of Tab Stash 3.5 already exists:**
  [pipolarbear/tab-stash](https://github.com/pipolarbear/tab-stash), release
  `v3.5-chrome`. Verified: it builds, all 621 unit tests pass, the side panel
  page renders, and stash-all followed by restoring the group works with no
  console errors. It is a hard fork: it deletes Firefox support (containers,
  browser settings, page action, sidebar) and replaces the Makefile with
  `scripts/build.mjs`.
- **No independent Chrome extension matches** Tab Stash's combination of
  bookmark storage, a side panel, and open source. The closest are Tabli
  (bookmarks, no side panel), Tabs Aside (side panel, own storage, analytics on
  by default), and NiceTab (open source, neither bookmarks nor a side panel).

## What Chrome cannot do (any port)

- **Hide tabs.** Chromium has no `tabs.hide`. Stashing closes tabs, and
  restoring re-opens them without their history.
- **Address-bar "stash this tab" button.** There is no `page_action` in MV3.
  A keyboard shortcut or context menu covers it.
- **Containers, `browserSettings`, `sessions.setTabValue`.** These are
  Firefox-only. Upstream already feature-detects most of them.
- **Sync in Helium.** Helium has no sync. Bookmarks stay local unless you add
  something like Floccus.

## Fixes already on this branch (MV2 `dist-chrome`)

Upstream's experimental `dist-chrome` build was broken in three ways. These
fixes also apply to an MV3 build:

1. Plural message keys such as `tab.one` are invalid in Chrome, which refuses
   to load the extension. `patch-locales-for-chrome.js` renames them to
   `tab__one`, and `$ts()` falls back to that form.
2. The manifest patcher pointed the toolbar icons at non-existent
   `icons/logo-N.svg`. They now point at the PNGs.
3. `tabs.create()` rejected `cookieStoreId: undefined`, so every restore
   failed. It is now only passed when it is set.

## MV3 on top of upstream: what it takes

Verified experiment: take `dist-chrome`, rewrite the manifest to MV3 (service
worker, `action`, `side_panel`, CSP object) and guard one call. With that, the
whole background model boots in a service worker and stash and restore work.
The UI pages already build their own models from browser APIs. The background
mostly hosts the IndexedDB key/value services, menus, and the toolbar action.

Remaining work, roughly in order:

1. **Manifest:** generate an MV3 manifest from `assets/manifest.json` in
   `patch-manifest-for-chrome.js`. Upstream prefers this to a separate
   manifest.
2. **`navigator.storage.persist()`** is not available in workers. Guard it in
   `src/datastore/kvs/service.ts`. `unlimitedStorage` already prevents
   eviction.
3. **`src/index.ts`:**
   - register `contextMenus`, `action` and `commands` listeners synchronously
     at top level, then await the model inside them;
   - create menus idempotently (`removeAll()` or `onInstalled`);
   - alias `browser.action` to `browser.browserAction`;
   - move the daily GC from `setTimeout` to `chrome.alarms`, because it
     currently runs on every service-worker start.
4. **Nanoservice:** register `runtime.onConnect` synchronously, and drop (not
   ignore) connections for services that aren't registered yet, so clients
   reconnect. pipolarbear's `src/util/nanoservice/live.ts` changes do this.
5. **Side panel:**
   - add `side_panel.default_path`;
   - make `hasSidebar()` and the menu entries detect `sidePanel`;
   - call `sidePanel.open({windowId})` synchronously in the gesture handler.
     Any `await` first loses the user gesture.
   - Open issue: on a cold service-worker start the options aren't loaded yet,
     so "stash and show sidebar" can't know synchronously whether to open the
     panel.
6. **Popup:** `action.openPopup()` works in Chrome 127+, so the existing
   set-then-clear popup hack should carry over.

Both pipolarbear's fork and upstream are MPL-2.0, so their solutions can be
reused here with attribution.

## Upstream context

- [josh-berry/tab-stash#52](https://github.com/josh-berry/tab-stash/issues/52)
  is the open "Port to Chrome" issue. The maintainer has said he'll take
  Chrome fixes that don't compromise Firefox, with minimal browser-specific
  branches.
- AI-assisted MV3 PRs [#711](https://github.com/josh-berry/tab-stash/pull/711)
  and [#713](https://github.com/josh-berry/tab-stash/pull/713) were closed.
  `AGENTS.md` requires the maintainer's written approval on the issue before
  any AI-generated contribution is submitted upstream.

## Helium-specific notes

- Helium 0.19.x is based on Chromium 155.
- [imputnet/helium#386](https://github.com/imputnet/helium/issues/386): on
  Windows, the toolbar button and shortcut don't open extension side panels.
  The right-click menu works.
- Memory Saver and tab freezing are on by default, so expect many discarded
  tabs.
- Load the extension unpacked from `chrome://extensions` with developer mode
  on. The Chrome Web Store no longer lists MV2 extensions.

## Building in this repo

Run `make build-chrome-dbg` to get `dist-chrome/`. It needs Inkscape and rsync
(see `README.md`).
