# Digital Typewriter

**An AI Writers Retreat open source writing tool.**

A browser typewriter for drafting without a delete key in easy reach. It types
one character at a time onto a real page, stops at the right margin, rings when
you get close, and keeps what you wrote on your own device.

Five machines — a Remington Noiseless, an Underwood No. 5, a Royal Quiet De
Luxe, an Olivetti Lettera 22 and an IBM Executive — each with its own typeface,
strike irregularity and synthesized sound. Four ribbons, including a stencil.

## What it does

- **Types like a machine.** The carriage stops at the right margin and locks
  until you return it, the bell warns you before you get there, and striking the
  same key twice darkens the character instead of inserting another.
- **Keeps your work.** Every sheet autosaves to this browser and comes back when
  you reload. Nothing is uploaded anywhere unless you ask it to be.
- **Lets the words out.** Download as `.txt`, copy to the clipboard, save to your
  own Google Drive, or export the page as a PNG or a typeset PDF.
- **Undo, despite everything.** `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`. Typing runs
  collapse into one step, so undo removes a phrase rather than a letter.
- **Backspace Lock.** Turn it on and the delete keys stop working. Fix it in the
  next draft.

## Run it

**Prerequisites:** Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the printed URL. There is no account, no server and no API key.

```bash
npm run build     # production bundle
npm run lint      # typecheck
npm test          # unit tests
```

## Optional: saving to Google Drive

Drive export is off unless you supply your own OAuth client. Without one the
Drive button never appears and the app makes no third-party requests.

1. In the [Google Cloud console](https://console.cloud.google.com/), create an
   OAuth 2.0 **Web application** client and enable the **Google Drive API**.
2. Add your origin (for example `http://localhost:3000`) to the client's
   authorised JavaScript origins.
3. Copy `.env.example` to `.env.local` and set:

   ```
   VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   ```

The app requests the `drive.file` scope only, which grants access to files it
creates itself. It cannot see, list or modify anything else in your Drive, and
no token is stored — closing the tab ends the grant.

## Optional: analytics

Set `VITE_GA_MEASUREMENT_ID` to a GA4 measurement ID to enable page analytics.
Left empty, no analytics script loads. When enabled it runs with `anonymize_ip`
on, Google Signals off, and query strings stripped from the reported path.

## Where your writing lives

In `localStorage`, on the device you typed it on, under a single key. It is not
encrypted and it is not synced. Clearing your browser data clears your sheet —
export anything you want to keep.

## Project layout

```
src/lib/          document model, layout, audio synthesis, ribbon wear, exporters
src/hooks/        document state: undo history and autosave
src/components/   toolbar and the typewriter itself
src/fonts/        typefaces, embedded for PDF export
```

The layout engine, undo history, persistence, exporters and PDF pipeline are
pure modules with unit tests; `npm test` runs them.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint` and `npm test`
before opening one — CI runs both.

## Licence

MIT. See [LICENSE](LICENSE).
