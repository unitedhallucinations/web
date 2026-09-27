// Injects schema.org JSON-LD into each page.
//
//   npm run metadata
//
// The pages are hand-authored and hosting serves the repo as-is, so there is
// nowhere to run a build. This writes the block between the metadata:start and
// metadata:end comments in place and the result is committed, the same deal as
// sitemap.xml.
//
// Every value is parsed out of markup that is already in the page — the
// canonical link, the meta description, the h1, and the fallback <a> inside each
// Bandcamp embed. Nothing is declared here that a reader cannot already see, so
// the structured data cannot drift away from the page it describes.
//
// That matters more than usual on this site: the artist pages have almost no
// prose of their own, because the releases live inside bandcamp.com iframes.
// Crawlers largely do not read cross-origin iframe content, so without this the
// release titles and URLs exist only inside the meta description. The JSON-LD
// puts them back in the document as data the site actually owns.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SCHEMA = 'https://schema.org';

const HOME = 'index.html';
const NOT_PAGES = new Set(['index_old.html']);

const START = '<!-- metadata:start -->';
const END = '<!-- metadata:end -->';
const BLOCK = /[ \t]*<!-- metadata:start -->[\s\S]*?<!-- metadata:end -->/;
const INDENT = '  ';

// Google truncates around here, so a longer description is a silently wasted
// sentence. The floor is just the point where it stops being a summary.
const DESC_MAX = 160;
const DESC_MIN = 70;

// Quoted attribute values are matched against a backreference for the closing
// quote, never a bare ["'], and the body is lazy rather than negated: a
// description containing an apostrophe ("All of Yesterday's Parties") otherwise
// ends the match at the apostrophe and the value is silently truncated. ">" is
// excluded from the body because a raw one cannot appear inside an attribute
// value, which stops a malformed tag matching across the rest of the file.
const IFRAME = /<iframe\b([^>]*)>([\s\S]*?)<\/iframe>/gi;
const ANCHOR = /<a\b[^>]*href=(["'])([^>]*?)\1[^>]*>([\s\S]*?)<\/a>/i;
const CTA = /<a[^>]*class=(["'])cta\1[^>]*href=(["'])([^>]*?)\2[^>]*>([\s\S]*?)<\/a>/gi;
const CANONICAL = [
  /<link[^>]+rel=(["'])canonical\1[^>]*href=(["'])([^>]*?)\2/i,
  /<link[^>]+href=(["'])([^>]*?)\1[^>]*rel=(["'])canonical\3/i,
];
const DESCRIPTION = [
  /<meta[^>]+name=(["'])description\1[^>]*content=(["'])([^>]*?)\2/i,
  /<meta[^>]+content=(["'])([^>]*?)\1[^>]*name=(["'])description\3/i,
];
// Enough to cover what the pages actually contain, and to leave anything
// unrecognised alone rather than silently mangling it.
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

const warnings = [];

function warn(file, message) {
  warnings.push(`  ! ${file}: ${message}`);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function decode(text) {
  return text.replace(/&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/gi, (m, body) => {
    if (body[0] !== '#') {
      const key = body.toLowerCase();
      return key in ENTITIES ? ENTITIES[key] : m;
    }
    const code = body[1] === 'x' || body[1] === 'X'
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

// Every value pulled out of a page goes through this, so the structured data is
// never a regex away from containing markup.
function textOf(html, re) {
  const m = html.match(re);
  if (!m) return null;
  const out = decode(m[1].replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
  return out || null;
}

function pick(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[m.length - 1];
  }
  return null;
}

function canonicalOf(html, file) {
  // Both orders are tried because both exist in the wild, and the canonical is
  // the id every node in the graph hangs off.
  const href = pick(html, CANONICAL);
  if (!href) {
    warn(file, 'no rel=canonical, so there is no stable id to hang the graph off');
    return null;
  }
  return decode(href.trim());
}

function titleOf(html, file) {
  const title = textOf(html, /<title>([\s\S]*?)<\/title>/i);
  if (!title) {
    warn(file, 'no <title>');
    return null;
  }
  return title;
}

function descriptionOf(html, file) {
  const desc = pick(html, DESCRIPTION);
  if (!desc) {
    warn(file, 'no meta description; crawlers will improvise one, and there is nothing to reuse as the node description');
    return null;
  }
  const out = decode(desc).replace(/\s+/g, ' ').trim();
  if (out.length > DESC_MAX) {
    warn(file, `meta description is ${out.length} chars, over the ~${DESC_MAX} that survive truncation`);
  }
  if (out.length < DESC_MIN) {
    warn(file, `meta description is only ${out.length} chars, too thin to stand in for the page`);
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Bandcamp's caption format is "Title by Credits", and the credits can contain a
// " by " of their own: "night bench by Ferretosan, PbToast14, Obscured by Crowds".
// So neither the first nor the last separator is reliable on its own — the first
// truncates "Obscured by Crowds", the last eats "by Crowds" into the title.
//
// The h1 is the artist whose plate this is, and Bandcamp always credits them
// first, so the first separator whose remainder starts with that name is the real
// one. Where the two spellings differ (KøЯ is credited as "KoR") nothing matches
// and the last separator is the best guess left.
function splitCaption(caption, artist) {
  if (artist) {
    for (let i = caption.indexOf(' by '); i >= 0; i = caption.indexOf(' by ', i + 1)) {
      const rest = caption.slice(i + 4).trim();
      if (rest === artist || rest.startsWith(`${artist},`)) return caption.slice(0, i).trim();
    }
  }
  const last = caption.lastIndexOf(' by ');
  return last < 0 ? null : caption.slice(0, last).trim();
}

// The embeds carry their own fallback anchor precisely so the player degrades
// to a real link. That anchor is the only place a release has a title and a
// canonical URL, which makes it the natural source for both.
function releasesOf(html, file, artist) {
  const releases = [];
  const used = new Set();

  for (const iframe of html.matchAll(IFRAME)) {
    const [, attrs, inner] = iframe;
    const link = inner.match(ANCHOR);
    if (!link) {
      warn(file, 'an embed has no fallback <a>, so it has no title or url to describe');
      continue;
    }

    const url = decode(link[2].trim());
    const caption = textOf(`<i>${inner}</i>`, /<i>([\s\S]*?)<\/i>/i);
    const title = splitCaption(caption, artist);
    if (!title) {
      warn(file, `could not find the title/credits split in "${caption}", so the embed was skipped`);
      continue;
    }

    // The last path segment is stable across a reorder, which the release's
    // position in the page is not, so it makes a better @id.
    let slug = url.split('/').filter(Boolean).pop() || `release-${releases.length + 1}`;
    if (used.has(slug)) {
      const before = slug;
      let n = 2;
      while (used.has(`${before}-${n}`)) n += 1;
      slug = `${before}-${n}`;
      warn(file, `two embeds resolve to the id "${before}"; the second became "${slug}"`);
    }
    used.add(slug);

    releases.push({
      title,
      url,
      origin: hostOf(url) ? new URL(url).origin : '',
      slug,
      type: /\/album\//.test(url) || /embed--album/.test(attrs) ? 'MusicAlbum' : 'MusicRecording',
    });
  }

  return releases;
}

function artistsOf(html) {
  return [...html.matchAll(CTA)].map(([, , , href, name]) => ({
    label: textOf(`<i>${name}</i>`, /<i>([\s\S]*?)<\/i>/i),
    href: decode(href.trim()),
  }));
}

// One pass over every page produces both the injected block and the checks that
// the block is internally consistent.
function readPages() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.html') && !NOT_PAGES.has(e.name))
    .map((e) => e.name)
    .sort()
    .map((file) => {
      const html = read(file);
      const canonical = canonicalOf(html, file);
      const artist = textOf(html, /<h1[^>]*class=["'][^"']*artist-name[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
      return {
        file,
        html,
        canonical,
        title: titleOf(html, file),
        description: descriptionOf(html, file),
        artist,
        releases: releasesOf(html, file, artist),
        artists: artistsOf(html),
      };
    });
}

function compact(node) {
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      delete node[key];
    }
  }
  return node;
}

function pageNode(page, site, about) {
  return compact({
    '@type': 'WebPage',
    '@id': page.canonical,
    url: page.canonical,
    name: page.title,
    description: page.description,
    isPartOf: { '@id': `${site}#site` },
    about: { '@id': about },
  });
}

// A Bandcamp belongs to the label only when it shares the label's subdomain.
// Ferretosan has its own Bandcamp, and asserting the label is the same entity as
// one of its artists is worse than leaving the field out.
function labelSameAs(site, pages) {
  const want = hostOf(site).split('.')[0];
  const origins = new Set();
  for (const page of pages) {
    for (const release of page.releases) {
      const host = hostOf(release.url);
      if (host.endsWith('.bandcamp.com') && host.split('.')[0] === want) {
        origins.add(release.origin);
      }
    }
  }
  return [...origins].sort();
}

function labelGraph(page, pages, site) {
  const labelId = `${site}#label`;
  const siteId = `${site}#site`;

  // "United Hallucinations — state press imprint" is the title; the part before
  // the dash is the name and the part after is the descriptor.
  const at = page.title ? page.title.indexOf(' — ') : -1;
  if (at < 0) {
    warn(page.file, 'the title has no " — " descriptor, so the label name is being taken from the whole title');
  }
  const name = page.title ? (at < 0 ? page.title : page.title.slice(0, at).trim()) : null;

  const graph = [
    pageNode(page, site, labelId),
    compact({
      '@type': 'WebSite',
      '@id': siteId,
      url: site,
      name,
      publisher: { '@id': labelId },
    }),
    compact({
      '@type': 'Organization',
      '@id': labelId,
      name,
      url: site,
      description: page.description,
      logo: { '@type': 'ImageObject', url: new URL('favicon.svg', site).href },
      sameAs: labelSameAs(site, pages),
    }),
  ];

  if (page.artists.length) {
    // Each link resolves to the same url the artist page canonicalises to, so
    // this id is the same node the artist page publishes.
    const items = page.artists.map(({ label, href }, i) => {
      const url = new URL(href, site).href;
      const target = pages.find((p) => p.canonical === url);
      if (!target) warn(page.file, `"${label}" points at ${url}, which is not a page here`);
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: { '@id': `${url}#artist` },
      };
    });
    graph.push({
      '@type': 'ItemList',
      '@id': `${site}#artists`,
      name: 'Plates',
      numberOfItems: items.length,
      itemListOrder: `${SCHEMA}/ItemListOrderAscending`,
      itemListElement: items,
    });
  }

  return graph;
}

function artistGraph(page, site) {
  if (!page.artist) warn(page.file, 'no h1.artist-name, so there is no artist to describe');
  if (!page.releases.length) warn(page.file, 'no releases found, so the page describes an artist with no catalogue');

  const artistId = `${page.canonical}#artist`;
  const origins = [...new Set(page.releases.map((r) => r.origin).filter(Boolean))].sort();

  const graph = [
    pageNode(page, site, artistId),
    compact({
      '@type': 'MusicGroup',
      '@id': artistId,
      name: page.artist,
      url: page.canonical,
      description: page.description,
      sameAs: origins,
    }),
  ];

  if (page.releases.length) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${page.canonical}#releases`,
      name: `${page.artist} — releases`,
      numberOfItems: page.releases.length,
      itemListOrder: `${SCHEMA}/ItemListOrderAscending`,
      itemListElement: page.releases.map((release, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: { '@id': `${page.canonical}#${release.slug}` },
      })),
    });

    for (const release of page.releases) {
      graph.push(
        compact({
          '@type': release.type,
          '@id': `${page.canonical}#${release.slug}`,
          name: release.title,
          url: release.url,
          byArtist: { '@id': artistId },
        }),
      );
    }
  }

  return graph;
}

// The origin comes from the index's own canonical rather than a constant, so
// there is one place to change when the domain does instead of two that have to
// agree.
function siteOf(pages) {
  const home = pages.find((p) => p.file === HOME);
  if (!home || !home.canonical) {
    throw new Error(`${HOME} needs a rel=canonical before anything else can be generated.`);
  }
  return home.canonical.replace(/\/[^/]*$/, '/');
}

function serialize(graph) {
  // "<" cannot appear in JSON-LD markup, and escaping it keeps a release title
  // from ever being able to close the script tag early.
  return JSON.stringify({ '@context': SCHEMA, '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

// The block is indented as a unit so that replacing it in place cannot leave a
// stray indent behind from the markers it swallowed.
function renderBlock(graph) {
  const script = ['<script type="application/ld+json">', serialize(graph), '</script>'].join('\n');
  return [START, script, END]
    .join('\n')
    .split('\n')
    .map((line) => INDENT + line)
    .join('\n');
}

// Replacing in place keeps the block where the author put it. A page without the
// comments gets one appended, so a new artist page only needs the same title and
// h1 the rest of the site already requires.
function applyBlock(html, block, file) {
  if (BLOCK.test(html)) return html.replace(BLOCK, () => block);
  if (!html.includes('</head>')) {
    warn(file, 'no </head> to put the structured data in');
    return html;
  }
  return html.replace('</head>', `${block}\n</head>`);
}

const pages = readPages();
const site = siteOf(pages);

for (const page of pages) {
  if (!page.canonical) continue;
  const graph = page.file === HOME ? labelGraph(page, pages, site) : artistGraph(page, site);
  const next = applyBlock(page.html, renderBlock(graph), page.file);
  if (next !== page.html) {
    fs.writeFileSync(path.join(ROOT, page.file), next);
    console.log(`updated ${page.file} — ${graph.length} node(s)`);
  } else {
    console.log(`unchanged ${page.file} — ${graph.length} node(s)`);
  }
}

if (warnings.length) {
  console.log('\nwarnings:');
  console.log(warnings.join('\n'));
} else {
  console.log('\nno warnings');
}
