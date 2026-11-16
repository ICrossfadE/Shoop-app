# Android local repository

Database: `shopik-android-local`, schema version 2. The feasibility database from 020 stays separate; it contains diagnostic fixtures, not account data to migrate.

The normalized graph reuses canonical TypeScript Product/Category/Tag/Expense types. Each scope is keyed by JSON of account ID, workspace ID and membership epoch. Stores:

- workspaces: confirmed graph, pending projection, ID mappings, downloaded-month flags, bootstrap flag, last server revision and next sequence.
- operations: composite scope/operation key, immutable intention, explicit local refs/creates, dependencies, base revision, action time, state/attempts, frozen wire payload and acknowledgement revision.
- drafts: product form drafts, isolated by scope and draft key. References resolve through the same mappings when loaded.
- snapshots: disposable filter-result IDs; clearing them never clears normalized entities, drafts or outbox.

## Transaction boundary

accept validates and reduces a command, then writes the graph and operation in one readwrite transaction with durability=strict. The Promise resolves only on transaction.complete. Duplicate operation ID, invalid relation, quota or abort rejects the action and rolls back projection and sequence. Calls clone their inputs before awaiting, so caller mutation cannot change an accepted intention or scope.

beginSend enforces scope sequence and acknowledged dependencies. The first call resolves only typed dependency refs and persists the complete wire JSON before any network work. Created entity keys remain explicit local client keys; server-generated category/tag/expense UUIDs and SHA256 product IDs arrive through mappings. Retry of a sending operation retains its ID and exact wire JSON and increments attempts. A cold restart leaves sending as sending. There is no TTL/prune for operations.

acknowledge applies mappings, canonical confirmed entities, acknowledgement and replayed pending projection atomically. Missing/foreign/colliding mappings or invalid replay abort the whole confirmation. Text fields are never searched/replaced for IDs. Confirmation replay with the same operation/revision is idempotent. A conflicting acknowledgement is rejected.

Pending/sending/needs-auth/conflict/rejected/acknowledged are separate states. Conflict and rejected are terminal until the later explicit resolution workflow; they cannot be converted into a new mutable sending payload. Their visible projection remains available for that workflow. getSession/auth events are not imported into this module; sync must use the 023 scope authorization gate before dispatching.

## Versions and transport boundary

The v1→v2 migration adds a unique scope/sequence index and fills compatible envelope fields. A legacy sending operation without its original wire JSON aborts upgrade, preserving the v1 database. Unknown newer database/envelope versions fail closed. versionchange closes old connections; blocked upgrades produce an error instead of deleting/recreating data.

commandVersion=1 and the wire envelope are local contracts for stages 025/026, **not an existing deployed RPC**. Revisions are opaque values at this layer; per-entity revision checks, receipt authenticity, server ordering, conflict reconciliation and automatic sync belong to 025/026. importConfirmed merges a typed patch and replays local intentions; incompatible replay fails without discarding them. Full graph writes favor clarity for v1 and need performance measurement for very large workspaces.

No method stores credentials or sends network requests. No browser service worker or full website offline mode is added. IndexedDB itself is not encrypted by this adapter. Keystore credentials remain in the separate adapter from 023.

## Verification

`npm test`: deterministic transaction/state/migration tests with fake-indexeddb, including simulated quota failure.
`npm run test:indexeddb`: actual IndexedDB in a fresh headless Chromium profile, using two separate browser processes and the same disk profile. It checks commit, transaction abort, versionchange migration, frozen sending restart, canonical ID mapping and snapshot isolation. Requires installed Edge/Chrome or SHOPIK_TEST_BROWSER; uses Vite and Node's built-in WebSocket, with no extra dependency. It opens only a temporary test fixture, not the Shopik web app, and removes its temporary profile afterwards.

A graceful browser process restart is not physical Android force-stop/reboot/update or power-loss testing. Those acceptance steps remain open.
