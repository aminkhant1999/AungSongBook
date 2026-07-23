# AMK Personal Songbook

A public, responsive song library with a secure single-administrator workspace. Visitors can search and filter published songs, open a practice-friendly lyrics-and-chords reader, transpose chords, and personalise the reading view. The administrator can create, review, publish, edit, and safely remove songs.

> Copyright note: the repository contains no copyrighted lyrics or third-party chord arrangements. The three requested starter songs are private drafts with content placeholders. Only add material you created, public-domain material, or content you are licensed to store and display.

## Features

- Public song library with combined search, filters, sorting, URL-backed query state, and Unicode/Burmese support
- Song detail reader with aligned chords, three display modes, adjustable type size, key/chord transposition, and remembered device preferences
- Responsive light and dark themes with keyboard navigation, visible focus states, semantic landmarks, and accessible feedback
- Server-side admin sessions in HTTP-only, SameSite cookies; bcrypt password verification; protected write endpoints; login rate limiting
- Draft, review, and publish workflow with licensing confirmation and soft deletion
- Manual entry plus isolated, optional metadata-correction service that remains usable without an AI key
- SQLite repository layer, repeatable schema setup, seed drafts, indexes, search, last-opened throttling, and job status records
- REST API with consistent success/error envelopes

## Technology and architecture

The browser client is HTML, CSS, and vanilla JavaScript ES modules. Express serves the client and REST API. `better-sqlite3` stores shared data through a repository module, while authentication, validation, music utilities, and optional AI suggestions stay in separate modules. SQLite is appropriate for a single-instance personal deployment with a persistent disk; use PostgreSQL before horizontally scaling.

```
client/                 public interface and admin screens
server/app.js           Express app and routes
server/repository.js    data-access layer
server/db.js            schema, indexes, and safe seed drafts
server/security.js      bcrypt login and server-side sessions
server/ai/service.js    replaceable metadata suggestion boundary
test/                   API, security, workflow, and music tests
```

## Local setup

Requirements: Node.js 22 or newer.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Create an administrator password hash with `npm run hash-password`.
4. Put the resulting hash in `ADMIN_PASSWORD_HASH`. Create a random secret of at least 32 characters for `SESSION_SECRET`.
5. Start development with `npm run dev`, then open `http://localhost:3000`.

The database and starter draft records are created automatically. Run `npm run seed` to safely re-run the seed operation.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Web server port |
| `DATABASE_URL` | SQLite path, such as `./data/songbook.db` |
| `CLIENT_URL` | Exact allowed browser origin |
| `ADMIN_USERNAME` | Initial value is `AMK` |
| `ADMIN_PASSWORD_HASH` | bcrypt hash; never the password |
| `SESSION_SECRET` | Random value of at least 32 characters |
| `OPENAI_API_KEY` | Optional metadata assistant key |
| `LYRICS_PROVIDER_API_KEY` | Reserved for a licensed provider |
| `CHORD_PROVIDER_API_KEY` | Reserved for a licensed provider |

Do not commit `.env`, database files, password hashes used in production, or provider credentials.

## Commands

- `npm run dev` — watch-mode development server
- `npm start` — production server
- `npm run build` — verify and copy production client assets
- `npm test` — automated workflows and security checks
- `npm run lint` — static code checks
- `npm run seed` — create missing starter draft records
- `npm run hash-password` — interactively create a bcrypt hash

## Administrator guide

Select **Login**, sign in as `AMK`, and open the dashboard. Use **Add song** for authorised manual content. The metadata-draft button suggests corrections but never publishes a song or invents lyrics. Review the suggestion, source, licence, structured content, and public preview before publishing. Deletion is a recoverable soft delete at database level.

Structured content uses sections and character-positioned chords:

```json
{"sections":[{"type":"verse","label":"Verse 1","lines":[{"lyrics":"An original line","chords":[{"chord":"C","position":0},{"chord":"G","position":12}]}]}]}
```

## AI and content licensing

The app functions fully without `OPENAI_API_KEY`. The service boundary currently offers deterministic correction examples and a manual fallback; it deliberately does not fetch lyrics. Before integrating a provider, confirm that its terms permit persistent storage and public display, implement attribution and caching restrictions, and keep its credential on the server. AI must never be used to reconstruct copyrighted lyrics or bypass a provider licence.

## Deployment

### Render (recommended)

1. Push this repository to GitHub.
2. Create a Render Blueprint from `render.yaml`.
3. Set `ADMIN_PASSWORD_HASH` and the deployed `CLIENT_URL` (for example, `https://amk-songbook.onrender.com`). Render generates `SESSION_SECRET`.
4. Deploy and verify `/api/health`, public browsing, login, and an admin draft round trip.

The Blueprint mounts a persistent disk for SQLite. If deploying to a host without a persistent disk, migrate the repository layer to managed PostgreSQL before production.

### Docker or another Node host

Build with the included `Dockerfile`, mount persistent storage at `/app/data`, and configure the same environment variables. Keep one application instance when using SQLite.

Public website URL: _add after a verified deployment_  
API URL: _the same origin, under `/api`_

## API summary

Public: `GET /api/songs`, `GET /api/songs/:slug`, `POST /api/songs/:id/open`, `GET /api/filters`, `GET /api/health`.

Authentication: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.

Protected administration: dashboard, song CRUD, publish/unpublish, metadata draft, and job status routes under `/api/admin`.

## Troubleshooting

- **Login disabled:** configure both `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, then restart.
- **Database cannot open:** ensure the directory containing `DATABASE_URL` is writable and persistent.
- **Browser request rejected:** set `CLIENT_URL` to the exact deployed origin, including `https://`.
- **Draft not visible publicly:** this is intentional; publish it from the admin workspace.
- **Content will not publish:** confirm the licensing checkbox when lyrics or arranged chords are present.

## Known limitations and future work

Version 1 has one administrator, a JSON-based structured editor, and a single-instance SQLite deployment. Future improvements can add a visual chord-position editor, PostgreSQL, provider-specific licensed imports, cover uploads, audit history, recovery UI, and end-to-end browser tests.
