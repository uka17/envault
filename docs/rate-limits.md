# Rate limits

## Client IP behind nginx

Production topology:

```
Browser -> envault-nginx (${WEB_HOST}) -> envault-api:9000
```

The API only sees TCP connections from nginx, so every IP-based limit needs the real client
address from `X-Forwarded-For`. That header is partly client-controlled: nginx uses
`$proxy_add_x_forwarded_for`, which appends the real peer address to whatever the client sent.

The API therefore trusts only an explicit list of proxies, set in `TRUST_PROXY`:

- `TRUST_PROXY` is a comma-separated list of IP addresses, CIDR subnets or `loopback`.
  In production set it to the nginx container address (the `WEB_HOST` value of `envault_fe`).
- Express walks `X-Forwarded-For` from right to left, skipping trusted proxies, and uses the first
  untrusted address as `req.ip`. Anything the client put to the left of it is ignored.
- `TRUST_PROXY` is required when `ENV=PROD`, and the API refuses to start without it. Values that
  trust everyone (`true`, hop counts, `0.0.0.0/0`, `::/0`) are rejected.
- Without `TRUST_PROXY` (local development) `X-Forwarded-For` is ignored and `req.ip` is the
  socket peer.

Example: a client sends `X-Forwarded-For: 1.2.3.4`, nginx forwards `1.2.3.4, 203.0.113.7`.
With `TRUST_PROXY=<nginx address>` the API uses `203.0.113.7`. With `trust proxy = true` it would
use the spoofed `1.2.3.4`, so rotating that value would bypass every IP limit.
