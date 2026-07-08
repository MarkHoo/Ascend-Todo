const repo = 'MarkHoo/Ascend-Todo';
const githubLatestReleaseApi = `https://api.github.com/repos/${repo}/releases/latest`;
const releasePageUrl = `https://github.com/${repo}/releases/latest`;

export default async () => {
  try {
    const response = await fetch(githubLatestReleaseApi, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ascend-Todo-Website',
      },
    });

    if (!response.ok) {
      return jsonResponse(
        {
          tag_name: '',
          html_url: releasePageUrl,
          assets: [],
          error: `GitHub ${response.status}`,
        },
        502,
        120,
      );
    }

    const release = await response.json();
    const assets = Array.isArray(release.assets)
      ? release.assets.map((asset) => ({
          name: asset.name,
          browser_download_url: asset.browser_download_url,
          size: asset.size,
          updated_at: asset.updated_at,
        }))
      : [];

    return jsonResponse(
      {
        tag_name: release.tag_name || '',
        html_url: release.html_url || releasePageUrl,
        published_at: release.published_at || '',
        assets,
      },
      200,
      1800,
    );
  } catch (error) {
    return jsonResponse(
      {
        tag_name: '',
        html_url: releasePageUrl,
        assets: [],
        error: error instanceof Error ? error.message : 'Unknown release lookup error',
      },
      502,
      120,
    );
  }
};

function jsonResponse(body, status, sharedMaxAgeSeconds) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=60, s-maxage=${sharedMaxAgeSeconds}, stale-while-revalidate=86400`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
