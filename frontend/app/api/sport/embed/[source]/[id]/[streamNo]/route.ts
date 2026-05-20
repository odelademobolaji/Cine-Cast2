import { NextRequest, NextResponse } from "next/server";

// Embed providers tried in order. First one that returns 2xx HTML wins.
const PROVIDERS = [
  "https://embedsports.top",
  "https://embedstreams.top",
  "https://embedme.top",
];

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Injected at the very top of <head>: locks down window.open, alert, and
// link-target=_blank navigation BEFORE the provider's ad scripts run.
const POPUP_BLOCKER = `<script>
(function(){
  try {
    var noop = function(){ return null; };
    Object.defineProperty(window, 'open', { value: noop, writable: false, configurable: false });
    window.alert = function(){};
    window.confirm = function(){ return false; };
    window.prompt = function(){ return null; };
    document.addEventListener('click', function(e){
      var t = e.target;
      while (t && t !== document) {
        if (t.tagName === 'A' && (t.target === '_blank' || t.target === '_new' || /^https?:/i.test(t.getAttribute('href') || ''))) {
          var href = t.getAttribute('href') || '';
          if (!href.startsWith('#') && !href.startsWith('javascript:')) {
            e.preventDefault(); e.stopPropagation(); return false;
          }
        }
        t = t.parentNode;
      }
    }, true);
    window.addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; return ''; }, true);
    // Strip target=_blank from any dynamically inserted anchor.
    var mo = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if (n.nodeType !== 1) return;
          if (n.tagName === 'A' && n.target) n.target = '_self';
          if (n.querySelectorAll) n.querySelectorAll('a[target]').forEach(function(a){ a.target = '_self'; });
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch(_) {}
})();
</script>`;

async function fetchProvider(base: string, source: string, id: string, streamNo: string): Promise<Response | null> {
  const url = `${base}/embed/${encodeURIComponent(source)}/${encodeURIComponent(id)}/${encodeURIComponent(streamNo)}`;
  try {
    const res = await fetch(url, {
      headers: { ...BASE_HEADERS, Referer: "https://streamed.su/", Origin: "https://streamed.su" },
      cache: "no-store",
    });
    if (res.ok) return res;
  } catch {
    // Try next provider.
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { source: string; id: string; streamNo: string } },
) {
  const { source, id, streamNo } = params;

  let upstream: Response | null = null;
  let usedBase = "";
  for (const base of PROVIDERS) {
    const r = await fetchProvider(base, source, id, streamNo);
    if (r) { upstream = r; usedBase = base; break; }
  }

  if (!upstream) {
    return new NextResponse("All embed providers failed", { status: 502 });
  }

  let html = await upstream.text();

  // Make root-relative URLs (src="/foo.js", href="/style.css") absolute so
  // the assets keep loading from the provider after we serve from our domain.
  html = html.replace(/(src|href|action)=(["'])\/(?!\/)/g, `$1=$2${usedBase}/`);

  // Inject our popup blocker before any other script in <head>.
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${POPUP_BLOCKER}`);
  } else {
    html = POPUP_BLOCKER + html;
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Allow embedding only on our own domain.
      "X-Frame-Options": "SAMEORIGIN",
      // Remove the upstream CSP so our injected script isn't blocked.
      "Content-Security-Policy": "",
    },
  });
}
