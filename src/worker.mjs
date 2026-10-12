const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/favicon.ico") {
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "public, max-age=86400" },
      });
    }

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return json({
        ok: true,
        service: "Super Chatty Jarvis site",
        version: "github-assets-v1",
        githubTokenConfigured: Boolean(env.GITHUB_TOKEN),
      });
    }

    if (url.pathname === "/github-check") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
          status: 405,
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "cache-control": "no-store",
            "allow": "GET",
            "x-content-type-options": "nosniff",
          },
        });
      }
      if (!env.GITHUB_TOKEN) {
        return json({ ok: false, error: "GitHub token is not configured" }, 503);
      }

      try {
        const response = await fetch(
          "https://api.github.com/repos/lostgodsgods-ops/super-chatty-jarvis",
          {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${env.GITHUB_TOKEN}`,
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Super-Chatty-Jarvis-Health-Check",
            },
          },
        );
        let data = {};
        try {
          data = await response.json();
        } catch {
          // Return a safe summary even if GitHub returns a non-JSON response.
        }
        const ok = response.ok;
        return json(
          {
            ok,
            githubStatus: response.status,
            repository: data.full_name || "lostgodsgods-ops/super-chatty-jarvis",
            defaultBranch: data.default_branch || null,
            private: typeof data.private === "boolean" ? data.private : null,
            permissions: data.permissions
              ? {
                  pull: Boolean(data.permissions.pull),
                  push: Boolean(data.permissions.push),
                  admin: Boolean(data.permissions.admin),
                }
              : null,
            message: ok
              ? "GitHub repository access verified"
              : (data.message || "GitHub API request failed"),
          },
          ok ? 200 : 502,
        );
      } catch {
        return json({ ok: false, error: "GitHub request failed" }, 502);
      }
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return json({ ok: false, error: "Static assets are not configured" }, 503);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};
