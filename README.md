# circle
Circle is a private social networking and messaging app for close circles.

## Run locally

1. Start the backend API:

```bash
cd server
npm start
```

2. Start the frontend app:

```bash
cd client
npm run dev
```

3. Open the browser at the Vite address shown by `npm run dev`.

## Notes
- Stranger search has been removed to enforce privacy.
- Friend requests must be created by direct invitation or by sharing exact usernames.
- Uploads and photos are stored in `server/uploads`.
