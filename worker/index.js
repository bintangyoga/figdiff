// Serves the figdiff website's static files, and the one page behind every /gh/... address.
// The addresses /gh/<owner>/<repo>/... are not files, so this Worker answers them with /gh/ (gh/index.html),
// whose script reads the address. It touches nothing else and never sees a design.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/gh") return Response.redirect(new URL("/gh/", url), 301);
    if (url.pathname.startsWith("/gh/")) {
      return env.ASSETS.fetch(new Request(new URL("/gh/", url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
