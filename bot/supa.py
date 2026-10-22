"""Supabase REST (PostgREST) 최소 클라이언트. service_role/secret 키는 서버(VPS)에만."""
import json
import urllib.parse
import urllib.request


class Supa:
    def __init__(self, url: str, key: str):
        u = url.strip().rstrip("/")
        if not u.startswith("http"):
            u = "https://" + u
        self.base = urllib.parse.urlsplit(u)._replace(path="", query="", fragment="").geturl() + "/rest/v1"
        self.headers = {"apikey": key, "content-type": "application/json"}
        if key.startswith("eyJ"):  # 예전 JWT 형식 service_role 키
            self.headers["authorization"] = f"Bearer {key}"

    def _req(self, method: str, path: str, body=None, extra=None):
        h = dict(self.headers, **(extra or {}))
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                txt = r.read().decode("utf-8")
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {method} {path.split('?')[0]} → {e.code} {e.read().decode('utf-8')[:300]}") from None

    def select(self, table: str, query: str = "select=*"):
        return self._req("GET", f"/{table}?{query}")

    def upsert(self, table: str, rows: list[dict], on_conflict: str, chunk: int = 500):
        for i in range(0, len(rows), chunk):
            self._req("POST", f"/{table}?on_conflict={on_conflict}", rows[i:i + chunk],
                      {"prefer": "resolution=merge-duplicates,return=minimal"})

    def delete(self, table: str, query: str):
        self._req("DELETE", f"/{table}?{query}", extra={"prefer": "return=minimal"})
