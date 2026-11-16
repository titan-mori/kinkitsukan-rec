// 確認用サイトにBasic認証（ID・パスワード）をかけるWorker
// ID・パスワードはCloudflareの「設定 → 変数とシークレット」に
// BASIC_USER / BASIC_PASS（種類：シークレット）として登録してください。

export default {
    async fetch(request, env) {
      const user = env.BASIC_USER;
      const pass = env.BASIC_PASS;
  
      // シークレット未設定のときは誰も入れないようにする
      if (!user || !pass) {
        return new Response("Basic auth is not configured.", { status: 500 });
      }
  
      const expected = "Basic " + btoa(`${user}:${pass}`);
      const auth = request.headers.get("Authorization") || "";
  
      if (auth !== expected) {
        return new Response("認証が必要です", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="Preview", charset="UTF-8"',
            "Content-Type": "text/plain; charset=UTF-8",
          },
        });
      }
  
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set("X-Robots-Tag", "noindex, nofollow"); // 検索エンジンに載せない
      headers.set("Cache-Control", "private, no-store");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    },
  };