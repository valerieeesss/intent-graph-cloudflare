# Intent Graph on Cloudflare

Cloudflare Worker version of the Intent Graph app. It fetches page content, compares pages, infers page intent/role with Claude, and can add two separate Google-backed signals:

- Vertex AI text embeddings and Google Cloud Natural Language salience (optional Google Cloud sign-in).
- SEO Gets Search Console query/page performance, used to show shared queries, impressions, and clicks between a pair of pages.

The content similarity score and Search Console evidence remain separate. Shared queries are evidence that pages appear for the same searches; they are not by themselves proof of keyword cannibalisation.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with a private app password, SEO Gets MCP key, and Anthropic key.
npm run dev
```

Open the local URL Wrangler prints. The app password protects all API routes. Enter it when prompted in the browser; it is held in that tab's `sessionStorage`.

The SEO Gets key is server-side only. In SEO Gets, create one under **Settings → MCP**. The Worker calls only the read-only `list_sites` and `get_site_performance` tools. It does not call tools that write to SEO Gets. SEO Gets MCP access requires an eligible subscription. Because SEO Gets supplies the Search Console data, this app does not need its own Search Console OAuth connection.

## Google Cloud option

The Google Cloud button asks the user to sign in for the `cloud-platform` scope. This provides a short-lived token in that browser tab for Vertex AI embeddings and Cloud Natural Language entity salience. The app does not store the token. Set `GOOGLE_OAUTH_CLIENT_ID` in `wrangler.jsonc` and configure the OAuth client's authorized origins for local development and the deployed Worker URL. The signed-in user needs Vertex AI and Natural Language API access in the configured project.

The default project is `entity-detector-510013`. Enabling APIs does not run requests; Vertex and Natural Language calls may be billable.

## Cloudflare secrets

Set these as encrypted Worker secrets. Do not commit them or add them to `wrangler.jsonc`:

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SEOGETS_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

`APP_PASSWORD` and `SEOGETS_API_KEY` are required to deploy. `ANTHROPIC_API_KEY` is optional; without it, page-role and intent fields use local heuristics. For local development, `.dev.vars` supplies these same values and is git-ignored.

## GitHub deployment

The included GitHub Actions workflow deploys on pushes to `main`. Add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN` with permission to deploy Workers.
- `CLOUDFLARE_ACCOUNT_ID` for the target Cloudflare account.

Set the Worker runtime secrets once with Wrangler as shown above. The OAuth client ID and Google Cloud project are non-secret Worker variables in `wrangler.jsonc`.

## Search evidence behavior

Enter the exact SEO Gets site name/property and a date range. The app requests performance grouped by page and query, matches returned rows to submitted URLs, and reports query overlap for every page pair, independently of the content-similarity cutoff:

- number of exact shared queries
- shared impressions and clicks, calculated as the lower of the two pages' metrics for each query
- up to five shared-query examples with each page's metrics and average position

The shared metric is a conservative pair-level comparison, not an additional GSC metric. Shared queries indicate search overlap, not proof that Google is switching between pages or that cannibalisation is harming performance. Confirm candidates by reviewing query-level performance over time and the actual pages' purpose. SEO Gets/Search Console can omit or cap rows; a missing match can also mean a canonical URL or property mismatch. The graph displays the query date range and the connection/data status.

## Routes

- `GET /api/health` — safe Worker health check.
- `GET /api/config` — non-secret OAuth setup information.
- `POST /api/seogets/sites` — checks the SEO Gets connection and lists sites using its read-only tool.
- `POST /api/analyze` — fetches pages, compares content, and optionally adds SEO Gets search evidence.

The Worker blocks local/private hostnames and IP-address URLs, limits analyses to 100 pages, and does not retain the submitted SEO Gets or Google Cloud access tokens. Analyses of this size can exceed Cloudflare Workers Free request limits; use a paid Workers plan for larger runs. Third-party API usage may also be billable.
