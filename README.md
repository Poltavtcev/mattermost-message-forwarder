# mattermost-message-forwarder

Mattermost plugin **Forward Anywhere**: forward any message to another channel or user—including from **private channels** and **DMs** where the built-in forward is not available. Includes **full text**, optional **file attachments**, a **permalink** to the original, and an optional **comment**.

**Repository:** [github.com/Poltavtcev/mattermost-message-forwarder](https://github.com/Poltavtcev/mattermost-message-forwarder)

## Requirements

- Mattermost **v7+** (see `min_server_version` in `plugin.json`)
- Go and Node.js (for local builds; see `webapp/package.json` / `.nvmrc` if present)

## Build

```bash
make dist
```

Produces `dist/forward-anywhere-*.tar.gz` (name and version from `plugin.json`).

## Install

1. System Console → **Plugins** → **Upload plugin** → select the bundle, or `mmctl plugin add <file>`.
2. Enable the plugin and reload the client if needed.

## Use

1. Post menu (⋮) → **Forward message** (EN/UK from account locale).
2. Choose a **channel** *or* enter a **username** for a new DM, optional **comment** → **Forward**.

## i18n

- Web UI: `webapp/src/i18n/messages.ts` (English, Ukrainian) + `registerTranslations`.
- Body of forwarded post: follows the **forwarding user’s** locale. REST error strings are **English** for clients.

## License

See [LICENSE](LICENSE).

## Release

1. Bump `version` in `plugin.json` and `CHANGELOG.md`.
2. `make dist`
3. Tag `vX.Y.Z` and create a GitHub Release with the `.tar.gz` from `dist/`.
