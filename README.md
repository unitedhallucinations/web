# web
The United Hallucinations website.

## Layout

Flat and static, no build step — hosting serves the repo as-is.

- `index.html` — the landing page
- `<artist>.html` — one page per artist plate
- `sitemap.xml` — generated, committed
- `metadata.js` — generated JSON-LD, injected into the pages
- `robots.txt` — hand-maintained
## Sitemap

`sitemap.xml` is generated so new pages can't be forgotten:

```sh
npm run sitemap
```

It scans the `.html` files in this directory and derives everything else:

- **order** — the index first, then artist pages by the `plate NN` number in
  their eyebrow
- **`lastmod`** — last commit date from git, falling back to file mtime
  (e.g. on a deploy that isn't a checkout)
- **`priority` / `changefreq`** — index is `1.0`/weekly, artist pages `0.7`/monthly

`index_old.html` is excluded by name (see `NOT_PAGES` in `sitemap.js`).
The script also warns about any page missing a `<title>` or meta description.

## Metadata

`npm run metadata` rewrites the `<!-- metadata:start -->` … `<!-- metadata:end -->`
block in each page with schema.org JSON-LD, and `npm run build` runs both scripts.

This one matters more than it looks. The artist pages carry almost no prose of
their own — the releases live inside `bandcamp.com` iframes, and crawlers
largely do not read cross-origin iframe content. So without this, release titles
and URLs exist only inside the meta description. The JSON-LD puts them back in
the document as data the site owns: a `MusicGroup` per artist, a `MusicRecording`
or `MusicAlbum` per release, and an `ItemList` tying them together.

Every value is parsed out of markup already in the page, so there is no second
copy to keep in step:

- **`@id`s** come from each page's `rel="canonical"`, which is why the origin is
  not repeated as a constant here
- **release titles and URLs** come from the fallback `<a>` inside each embed —
  the same link that makes the player work without JavaScript
- **`sameAs`** comes from the Bandcamp origin the releases point at. A Bandcamp
  counts as the label's only when it shares the label's subdomain, so Ferretosan's
  own Bandcamp is not asserted to be the label

Editing the block by hand is pointless — the next run overwrites it. To change
what it says, change the page.

## Analytics

GoatCounter, cookieless and no personal data, so there is no consent banner to
worry about. The tag sits between the stylesheet and the `<!-- metadata:start -->`
marker in every page:

```html
<script data-goatcounter="https://unitedhallucinations.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
```

It is hand-maintained, so it belongs *outside* the markers. `async` keeps it off
the render path, and the script is a couple of kB, but it is a third-party request
that most ad blockers will drop — expect the numbers to be a floor rather than a
total. It is not on `index_old.html` or `files(1)/`, which nobody should be
reaching anyway.

The `src` is protocol-relative, as GoatCounter's own snippet has it. `https://`
would be more explicit and behaves identically on an HTTPS site.

## The social share image is missing

`robots.txt` explains why: `banner.png` and `banner-2.png` are 975x180 and too
thin to work as share cards, and nothing replaces them yet. So `og:image` is
commented out in every page with a `TODO(seo)` note, and a shared link falls back
to a bare text card. Drop a 1200x630 card in `og/`, uncomment the block, and set
`twitter:card` to `summary_large_image`.

There are deliberately no `twitter:title` / `twitter:description` tags: X falls
back to the `og:` equivalents, and duplicating them here would only give the two
a chance to disagree.

## Duplicates

`index_old.html` and `files(1)/` are dead copies of the site and would otherwise
compete with the real pages, so both carry `<meta name="robots" content="noindex">`.
`Disallow` in `robots.txt` is not enough on its own — it stops a crawler reading
a page, not a page that is already indexed from a bare URL.

## Changing the domain

The origin lives in the `rel="canonical"` of each page and in `ORIGIN` in
`sitemap.js`. `metadata.js` reads the index's canonical rather than repeating it.
If the domain changes, update the canonical and `og:url` tags and `ORIGIN`
together.
