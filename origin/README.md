# Demo origin API

A tiny, realistic backend to point the proxy at while developing. Routes:
`GET /health`, `GET /users`, `GET /users/:id`, `GET /orders`, `GET /orders/:id`.

```bash
npm install
node server.js                    # :3001
BREAK_CONTRACT=1 node server.js   # simulate the silent breaking change (id -> _id)
```

The breaking change is scripted on purpose: the detection milestone uses it
to prove a silent `id` -> `_id` rename is caught as a contract violation.
See `scripts/flip-id.js`.
