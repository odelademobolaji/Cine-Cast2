import { NextRequest, NextResponse } from "next/server";

const PROVIDERS = [
  "https://embedsports.top",
  "https://embedstreams.top",
  "https://embedme.top",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Injected as the very first script in <head>.
// - Routes ALL XHR and fetch calls through /api/sport/proxy so the browser
//   never contacts third-party domains directly (bypasses AV content filters).
// - Freezes window.open and other popup APIs before provider ad-scripts run.
// - Prevents popunder blur trick and beforeunload navigation hijack.
const INTERCEPTOR = `<script>
(function(){
  var P='/api/sport/proxy?url=';
  var ADS=['googlesyndication','doubleclick','adnxs','popads','popcash','adsterra','adskeeper','propellerad','hilltopads','trafficjunky','a-ads','coinzilla'];
  function bad(u){return u&&ADS.some(function(x){return u.indexOf(x)>=0;});}
  function px(u){
    if(!u||typeof u!=='string')return u;
    var s=u.trim();
    if(!s||s.charAt(0)==='#')return s;
    if(/^(data:|blob:|javascript:|about:)/i.test(s))return s;
    if(s.indexOf('/api/sport/proxy')===0)return s;
    if(s.indexOf(location.origin+'/api/sport/proxy')===0)return s.slice(location.origin.length);
    if(s.slice(0,2)==='//')s='https:'+s;
    if(/^https?:\/\//i.test(s)){if(bad(s))return'about:blank';return P+encodeURIComponent(s);}
    return s;
  }
  // Popup locks
  try{Object.defineProperty(window,'open',{value:function(){return null;},writable:false,configurable:true});}
  catch(e){window.open=function(){return null;};}
  window.alert=window.confirm=window.prompt=function(){return null;};
  window.addEventListener('blur',function(){setTimeout(function(){try{window.focus();}catch(e){}},50);});
  window.addEventListener('beforeunload',function(e){e.preventDefault();e.returnValue='';return'';},true);
  document.addEventListener('click',function(e){
    var t=e.target;
    while(t&&t!==document){
      if(t.tagName==='A'){
        if(t.target&&t.target!=='_self'){e.preventDefault();e.stopPropagation();return;}
        var h=t.getAttribute('href')||'';
        if(/^https?:/i.test(h)&&h.indexOf(location.origin)!==0){e.preventDefault();e.stopPropagation();return;}
      }
      t=t.parentNode;
    }
  },true);
  // fetch proxy
  var _f=window.fetch;
  window.fetch=function(inp,init){
    try{
      var u=typeof inp==='string'?inp:(inp instanceof Request?inp.url:String(inp));
      if(bad(u))return Promise.resolve(new Response('',{status:204}));
      var pu=px(u);
      if(pu===u)return _f.call(window,inp,init);
      var opts={method:(init&&init.method)||(inp instanceof Request?inp.method:'GET')||'GET',
        headers:(init&&init.headers)||(inp instanceof Request?inp.headers:undefined),
        body:(init&&init.body)||(inp instanceof Request&&inp.method!=='GET'?inp.body:undefined),
        credentials:'omit',mode:'cors',cache:'default',redirect:'follow'};
      return _f.call(window,pu,opts);
    }catch(e){return _f.call(window,inp,init);}
  };
  // XHR proxy
  var _X=window.XMLHttpRequest;
  function PX(){var x=new _X(),_o=x.open.bind(x);x.open=function(){var a=Array.prototype.slice.call(arguments);var u=a[1];if(typeof u==='string'){if(bad(u))u='about:blank';else u=px(u);a[1]=u;}return _o.apply(x,a);};return x;}
  PX.prototype=_X.prototype;
  window.XMLHttpRequest=PX;
  // DOM observer: proxy src on video/source/img, strip _blank
  new MutationObserver(function(rs){rs.forEach(function(r){r.addedNodes.forEach(function(n){
    if(!n||n.nodeType!==1)return;
    var els=[n];
    if(n.querySelectorAll)[].push.apply(els,n.querySelectorAll('video,source,img,a'));
    els.forEach(function(el){
      var tg=el.tagName;
      if((tg==='VIDEO'||tg==='SOURCE'||tg==='IMG')&&el.src&&!/^blob:/i.test(el.src)){var ps=px(el.src);if(ps!==el.src)el.src=ps;}
      if(tg==='A'&&el.target&&el.target!=='_self')el.target='_self';
    });
  });});}).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

function rewriteUrls(html: string, providerBase: string): string {
  const P = "/api/sport/proxy?url=";

  // root-relative → absolute
  html = html.replace(
    /((?:src|href|action|data-src)\s*=\s*["'])\/(?!\/)/g,
    `$1${providerBase}/`,
  );
  // protocol-relative → https
  html = html.replace(
    /((?:src|href|action|data-src)\s*=\s*["'])\/\//g,
    `$1https://`,
  );
  // absolute http/https → proxy
  html = html.replace(
    /((?:src|href|action|data-src)\s*=\s*["'])(https?:\/\/[^"'\s>]+)/g,
    (_, attr, url) =>
      attr + (url.includes("/api/sport/") ? url : P + encodeURIComponent(url)),
  );
  // CSS url()
  html = html.replace(
    /url\(\s*["']?(https?:\/\/[^"')>\s]+)["']?\s*\)/g,
    (_, url) =>
      `url(${url.includes("/api/sport/") ? url : P + encodeURIComponent(url)})`,
  );
  // Remove upstream CSP meta tags so our injected script isn't blocked by them
  html = html.replace(
    /<meta[^>]+http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*\/?>/gi,
    "",
  );

  return html;
}

async function tryProvider(
  base: string,
  source: string,
  id: string,
  streamNo: string,
): Promise<{ html: string; finalBase: string } | null> {
  const url = `${base}/embed/${encodeURIComponent(source)}/${encodeURIComponent(id)}/${encodeURIComponent(streamNo)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://streamed.su/",
        Origin: "https://streamed.su",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    const html = await res.text();
    if (html.trim().length < 200) return null;
    const finalBase = (() => {
      try { const u = new URL(res.url); return `${u.protocol}//${u.host}`; }
      catch { return base; }
    })();
    return { html, finalBase };
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { source: string; id: string; streamNo: string } },
) {
  const { source, id, streamNo } = params;

  let result: { html: string; finalBase: string } | null = null;
  for (const base of PROVIDERS) {
    result = await tryProvider(base, source, id, streamNo);
    if (result) break;
  }

  if (!result) {
    return new NextResponse(
      `<!doctype html><html><body style="background:#111;color:#aaa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:10px">
        <div style="font-size:2em">📡</div>
        <div style="font-size:15px;color:#fff;font-weight:600">No stream providers responded</div>
        <div style="font-size:12px">Try refreshing or selecting a different source.</div>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  let { html, finalBase } = result;
  html = rewriteUrls(html, finalBase);

  // Inject interceptor as the very first thing in <head>
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${INTERCEPTOR}`);
  } else {
    html = INTERCEPTOR + html;
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "SAMEORIGIN",
      // Permissive CSP: allows our injected inline script + all origins for
      // media/scripts (the injected XHR proxy enforces what actually loads).
      "Content-Security-Policy":
        "default-src * blob: data:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; connect-src *;",
    },
  });
}
