// Wikimedia serves any photo as a thumbnail at a set of standard widths. Trip covers are saved at
// full size (up to 3,840 px and 2+ MB), so pages ask for the width they actually show instead.
// No imports: the app bundles this file too.

/** Widths Wikimedia pre-renders; other widths may be refused or slow. */
export const PHOTO_WIDTHS = [330, 500, 960, 1280, 1920] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

const HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);

/**
 * The same Wikimedia photo at `width` pixels wide. Other URLs come back unchanged.
 * - .../commons/thumb/a/ab/Name.jpg/2400px-Name.jpg → .../960px-Name.jpg
 * - .../commons/a/ab/Name.jpg (original) → .../commons/thumb/a/ab/Name.jpg/960px-Name.jpg
 */
export function photoAtWidth(url: string, width: PhotoWidth): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  if (!HOSTS.has(u.hostname)) return url;
  const thumb = /^(\/wikipedia\/[^/]+\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/)(\d+)px-([^/]+)$/.exec(u.pathname);
  if (thumb) { u.pathname = `${thumb[1]}${width}px-${thumb[3]}`; return u.toString(); }
  const original = /^\/wikipedia\/([^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp))$/i.exec(u.pathname);
  if (original) {
    const [, project, a, ab, file] = original;
    u.pathname = `/wikipedia/${project}/thumb/${a}/${ab}/${file}/${width}px-${file}`;
    return u.toString();
  }
  return url;
}

/** srcset for a responsive <img>: the browser picks the smallest width that looks sharp. */
export function photoSrcSet(url: string, widths: readonly PhotoWidth[] = [500, 960, 1920]) {
  const urls = widths.map(w => photoAtWidth(url, w));
  // Not a resizable photo (every width gives the same URL): no srcset.
  return new Set(urls).size === widths.length ? urls.map((u, i) => `${u} ${widths[i]}w`).join(", ") : undefined;
}
