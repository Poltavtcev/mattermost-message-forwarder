# Changelog

## 0.1.4

- **i18n:** Web UI strings for **English** and **Ukrainian** (`registerTranslations` + `t()` with user locale from Redux).
- **Server:** Forwarded post templates (header, empty body, permalink line) use the **forwarding user’s** locale; REST error responses use **English** consistently.
- **Webapp:** `AbortController` for user-search requests to avoid races when typing quickly; channel/DM option labels and sorts respect locale; menu label uses a connected component so the post menu string follows language.
- **Docs:** Root `README` replaced with product documentation; `plugin.json` description aligned with features (incl. attachments).

## 0.1.3 and earlier

- Core forward flow, modal UI, `CopyFileInfos` for attachments, and autocomplete for usernames (see git history).
