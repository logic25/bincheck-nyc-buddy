import { Helmet } from "react-helmet-async";

/**
 * Per-page SEO component. Pages that want custom title/description/OG
 * tags drop <SEO ... /> at the top of their render tree. Defaults fall
 * back to index.html so we never ship a blank tag.
 *
 * Canonical URL is constructed from the current pathname when not
 * provided so SPA routes get correct canonicals at runtime.
 */

interface SEOProps {
  title: string;
  description: string;
  /** Override canonical URL. Defaults to https://binchecknyc.com<pathname>. */
  canonical?: string;
  /** Path segment for canonical/OG when canonical not provided. */
  path?: string;
  /** Optional JSON-LD structured data block (object will be JSON.stringified). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** If true, robots will be told not to index this page (e.g. utility pages). */
  noindex?: boolean;
}

const SITE = "https://binchecknyc.com";

const SEO = ({ title, description, canonical, path, jsonLd, noindex }: SEOProps) => {
  const finalCanonical =
    canonical ??
    (typeof window !== "undefined"
      ? `${SITE}${window.location.pathname}`
      : path
        ? `${SITE}${path.startsWith("/") ? path : `/${path}`}`
        : SITE);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={finalCanonical} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={finalCanonical} />

      {/* Twitter / X */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />

      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;
