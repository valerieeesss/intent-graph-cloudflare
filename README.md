# Intent Graph on Cloudflare

Cloudflare Worker version of the Intent Graph app. Each analysis uses Google Search Console, Ahrefs, Google Cloud, and Claude (when configured):

- Vertex AI text embeddings for content similarity and Google Cloud Natural Language salience for the closest entity.
- Google Search Console query/page performance to show shared queries, impressions, clicks, and positions across pages.
- A 28-day GSC cannibalisation report with impression share, each page’s click-led top query, and page-specific problem/resolution notes informed by semantic role analysis.
- Ahrefs Keywords Explorer to look up Australian search volume for the highest-impression query found by Search Console for each page.

The content similarity score and Search Console evidence remain separate. Shared queries are evidence that pages appear for the same searches; they are not by themselves proof of keyword cannibalisation.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your OAuth client credentials and API keys.
npm run dev
```

Open the local URL Wrangler prints. The analysis requires a connected Google Search Console account and can also use Google Cloud, Ahrefs, and Anthropic API credentials.

The first time you connect Google Search Console, Google asks for read-only access. The app requests only `webmasters.readonly`. The optional **Remember this device** checkbox keeps an encrypted, HttpOnly cookie on that device for 30 days; without it, the cookie lasts for the browser session. The app uses the connected Google account only to read Search Console data.

## Google Cloud setup

Vertex AI embeddings and Google Cloud Natural Language entity analysis continue to use the Worker’s service account. Keep `GOOGLE_SERVICE_ACCOUNT_JSON` configured for those features. Search Console uses Google OAuth instead: the signed-in account must already have at least Restricted access to the relevant Search Console property.

The default project is `entity-detector-510013`. Every analysis now calls Vertex AI and Natural Language for each submitted page. These calls may be billable. Because the app is public, anyone with its URL can trigger usage against this service account.

## Cloudflare secrets

Set these as encrypted Worker secrets. Do not commit them or add secret values to `wrangler.jsonc`:

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put AHREFS_API_KEY
```

Set `GOOGLE_OAUTH_CLIENT_ID` as a Worker variable. In the Google OAuth web client, add the deployed Worker URL plus `/api/google/callback` as an authorized redirect URI. The service account JSON is required for Google Cloud analysis. The OAuth client ID and secret are needed for Search Console sign-in; add both before using GSC. Ahrefs and Anthropic keys are optional. Without the Ahrefs key, the sheet still includes each page’s top GSC query but no search volume. For local development, `.dev.vars` supplies local values and is git-ignored.

## Manual Cloudflare deployment

GitHub is used to store the source code; pushing to GitHub does not deploy the app. To deploy manually, create a Worker named `intent-graph-cloudflare`, authenticate Wrangler with `npx wrangler login`, add the Worker secrets above with `npx wrangler secret put`, then run `npm run deploy` from this directory. Wrangler uploads the Worker and the `public/` assets together. The Google Cloud project is a non-secret Worker variable in `wrangler.jsonc`.

## Search evidence behavior

The app lists properties accessible to the signed-in Google account and automatically selects a property that covers all submitted URLs. For each page, it gets query rows over six months and chooses the query with the most impressions as that page’s top GSC query. It then asks Ahrefs Keywords Explorer for that query’s Australian average monthly volume. Search Console clicks are compared across the earlier and latest three months. A separate 28-day cannibalisation worksheet normalises URL variants, excludes inferred or supplied brand terms, drops page/query pairs below five impressions, and keeps queries where at least two pages each qualify and the second page has at least 10% of property-level query impressions. If query-only GSC totals are unavailable, it uses the sum of submitted-page impressions and records that caveat. The worksheet includes problem and resolution text informed by each page’s semantic role and intent. Shared queries are reported independently of the content-similarity cutoff:

- number of exact shared queries
- shared impressions and clicks, calculated as the lower of the two pages' metrics for each query
- up to five shared-query examples with each page's metrics and average position

The shared metric is a conservative pair-level comparison, not an additional GSC metric. Shared queries indicate search overlap, not proof that Google is switching between pages or that cannibalisation is harming performance. Ahrefs volume is an estimate and is separate from GSC impressions. Confirm candidates by reviewing query-level performance over time and the actual pages' purpose.

## Routes

- `GET /api/health` — safe Worker health check.
- `GET /api/config` — reports whether the app’s service credentials are configured.
- `GET /api/google/auth` and `/api/google/callback` — connect Search Console with read-only OAuth access.
- `GET /api/google/status` and `POST /api/google/disconnect` — check or remove the remembered device connection.
- `POST /api/analyze` — fetches pages, runs semantic analysis, retrieves Search Console queries, and looks up Ahrefs volume.

The Worker blocks local/private hostnames and direct IP-address URLs and limits analyses to 100 pages. Google OAuth refresh tokens are encrypted in a secure, HttpOnly cookie and never placed in browser JavaScript. Anyone with the public URL can still submit analyses and trigger configured third-party usage. Analyses of this size can exceed Cloudflare Workers Free request limits; third-party API usage may also consume paid credits.
