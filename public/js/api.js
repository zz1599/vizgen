// API 客户端
(function () {
  const TOKEN_KEY = 'vizgen_token';
  window.API = {
    token() { return localStorage.getItem(TOKEN_KEY) || ''; },
    setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); },

    async req(method, url, body) {
      const headers = { 'Content-Type': 'application/json' };
      const t = this.token();
      if (t) { headers.Authorization = 'Bearer ' + t; headers['X-VizGen-Token'] = t; }
      const u = method === 'GET' ? url + (url.includes('?') ? '&' : '?') + '_=' + Date.now() : url;
      const res = await fetch(u, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
      return j;
    },
    get(url) { return this.req('GET', url); },
    post(url, body) { return this.req('POST', url, body); },
    del(url) { return this.req('DELETE', url); },

    async previewText(versionId) {
      const res = await fetch('/api/versions/' + versionId + '/preview?_=' + Date.now(), { headers: { Authorization: 'Bearer ' + this.token(), 'X-VizGen-Token': this.token() }, credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    },
  };
})();
