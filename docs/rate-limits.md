# Rate limits

## Client IP behind Cloudflare and nginx

Production topology:

```
Browser -> Cloudflare edge -> envault-nginx (${WEB_HOST}) -> envault-api:9000
```

Each hop only sees the TCP peer in front of it, so the client address has to be passed along
explicitly, and every hop must trust only the hop directly in front of it:

- nginx sees Cloudflare edge addresses. It restores the client address from `CF-Connecting-IP`
  with the `real_ip` module, accepting that header only from Cloudflare ranges
  (`set_real_ip_from`, see https://www.cloudflare.com/ips/). A request which reaches the server
  directly, bypassing Cloudflare, keeps its real peer address, so a forged `CF-Connecting-IP`
  is ignored.
- nginx overwrites `X-Forwarded-For` with that restored `$remote_addr` instead of appending to
  the value sent by the client.
- The API sees only nginx and reads the client address from `X-Forwarded-For`.

Without the nginx part `$remote_addr` is a Cloudflare edge address: one client is spread across
many edges and many clients share one edge, so IP-based limits are not effective. The nginx
configuration lives in `envault_fe/nginx.conf`.

The API trusts only an explicit list of proxies, set in `TRUST_PROXY`:

- `TRUST_PROXY` is a comma-separated list of IP addresses, CIDR subnets or `loopback`.
  In production set it to the nginx container address (the `WEB_HOST` value of `envault_fe`).
- Express walks `X-Forwarded-For` from right to left, skipping trusted proxies, and uses the first
  untrusted address as `req.ip`. Anything the client put to the left of it is ignored.
- `TRUST_PROXY` is required when `ENV=PROD`, and the API refuses to start without it. Values that
  trust everyone (`true`, hop counts, `0.0.0.0/0`, `::/0`) are rejected.
- Without `TRUST_PROXY` (local development) `X-Forwarded-For` is ignored and `req.ip` is the
  socket peer.

Example: a client sends `X-Forwarded-For: 1.2.3.4`, and an nginx which appends instead of
overwriting would forward `1.2.3.4, 203.0.113.7`. With `TRUST_PROXY=<nginx address>` the API
still uses `203.0.113.7`. With `trust proxy = true` it would use the spoofed `1.2.3.4`, so
rotating that value would bypass every IP limit.
