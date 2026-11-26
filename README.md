# Intent Graph on Cloudflare

Cloudflare Worker version of the Intent Graph app. Each analysis uses Claude (when configured), Google Cloud, and SEO Gets verification by default:

- Vertex AI text embeddings for content similarity and Google Cloud Natural Language salience for the closest entity.
- SEO Gets Search Console query/page performance to show shared queries, impressions, clicks, and positions across pages.

The content similarity score and Search Console evidence remain separate. Shared queries are evidence that pages appear for the same searches; they are not by themselves proof of keyword cannibalisation.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your SEO Gets MCP key and Anthropic key.
npm run dev
```

Open the local URL Wrangler prints. The app is public: anyone who can reach it can submit analyses, which use your Google Cloud and SEO Gets accounts and may use Anthropic.

The SEO Gets key is server-side only. In SEO Gets, create one under **Settings → MCP**. The Worker calls only the read-only `list_sites` and `get_site_performance` tools. It does not call tools that write to SEO Gets. SEO Gets MCP access requires an eligible subscription. Because SEO Gets supplies the Search Console data, this app does not need its own Search Console OAuth connection.

## Google Cloud setup

Google Cloud runs automatically from the Worker using a server-side service account. Create a dedicated service account in the Google Cloud project and grant it only the permissions needed to call Vertex AI and Cloud Natural Language. Enable both APIs in the project. Put the downloaded service account JSON into the encrypted `GOOGLE_SERVICE_ACCOUNT_JSON` Worker secret; do not commit the JSON file or paste it into chat. Google recommends avoiding user-managed service-account keys where possible; this setup uses one because Cloudflare Workers needs a server credential to call Google without a person signing in on every run.

The default project is `entity-detector-510013`. Every analysis now calls Vertex AI and Natural Language for each submitted page. These calls may be billable. Because the app is public, anyone with its URL can trigger usage against this service account.

## Cloudflare secrets

Set these as encrypted Worker secrets. Do not commit them or add them to `wrangler.jsonc`:

```bash
npx wrangler secret put SEOGETS_API_KEY
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put ANTHROPIC_API_KEY
```

`SEOGETS_API_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON` are required. `ANTHROPIC_API_KEY` is optional; without it, page-role and intent fields use local heuristics. For local development, `.dev.vars` supplies server-side values and is git-ignored. Keep all credentials out of GitHub; the public app can trigger usage against these accounts.

## Manual Cloudflare deployment

GitHub is used to store the source code; pushing to GitHub does not deploy the app. To deploy manually, create a Worker named `intent-graph-cloudflare`, authenticate Wrangler with `npx wrangler login`, add the Worker secrets above with `npx wrangler secret put`, then run `npm run deploy` from this directory. Wrangler uploads the Worker and the `public/` assets together. The Google Cloud project is a non-secret Worker variable in `wrangler.jsonc`.

## Search evidence behavior

The app loads SEO Gets properties automatically and matches the submitted URLs to a property by hostname. If it cannot find a match, choose the correct property from the list. It requests performance grouped by page and query, then reports overlap for every page pair, independently of the content-similarity cutoff:

- number of exact shared queries
- shared impressions and clicks, calculated as the lower of the two pages' metrics for each query
- up to five shared-query examples with each page's metrics and average position

The shared metric is a conservative pair-level comparison, not an additional GSC metric. Shared queries indicate search overlap, not proof that Google is switching between pages or that cannibalisation is harming performance. Confirm candidates by reviewing query-level performance over time and the actual pages' purpose. SEO Gets/Search Console can omit or cap rows; a missing match can also mean a canonical URL or property mismatch. The graph displays the query date range and the connection/data status.

## Routes

- `GET /api/health` — safe Worker health check.
- `GET /api/config` — reports whether server-side Google Cloud, SEO Gets, and Claude credentials are configured.
- `POST /api/seogets/sites` — checks the SEO Gets connection and lists sites using its read-only tool.
- `POST /api/analyze` — fetches pages, runs Google Cloud analysis, compares content, and adds SEO Gets search evidence.

The Worker blocks local/private hostnames and direct IP-address URLs, limits analyses to 100 pages, and does not retain the submitted SEO Gets or Google Cloud access tokens. The app has no sign-in: anyone with the public URL can run analyses and trigger third-party usage. Analyses of this size can exceed Cloudflare Workers Free request limits; use a paid Workers plan for larger runs. Third-party API usage may also be billable.
