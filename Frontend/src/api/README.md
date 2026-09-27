# `src/api` — the data layer

The whole app reads data through one interface, so switching from sample data
to the real backend is a one-line change and no component is touched.

- `types.ts` — data shapes, using the DOGFOOD spec's snake_case field names.
- `client.ts` — the `VerdiktApi` interface every component depends on.
- `mock.ts` — sample data implementation (used by default).
- `http.ts` — real `fetch()` implementation; endpoint paths live in `routes`.
- `index.ts` — picks `http` when `VITE_API_URL` is set, else `mock`, and
  exports `api`. Components import `api` from here.

## Connecting the backend

1. Set `VITE_API_URL` in a `.env` file (see `../../.env.example`).
2. Update the paths in `http.ts` `routes` to match the backend's
   `.dogfood.toml [routes]`.

That's it — the components keep calling the same methods.
