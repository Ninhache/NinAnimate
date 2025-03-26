# NinAnimate ✨

Powered by NextJS

### Installation

After cloning the project, install the dependencies using your preferred package manager:

```sh
yarn
# or
npm install
```

---

### Development

To run the app in development mode with hot reloading:

```sh
yarn dev
```

The app will be by default available at [http://localhost:3000](http://localhost:3000).

---

### Deployment

There are two main ways to ship this project:

#### Deploy as a Next.js App (Server-Rendered)

Any Node.js-capable server can render the app, only need to call the following commands:

```sh
yarn build
yarn start
```

#### 2. Deploy as Static Files (e.g., with Nginx)

If you prefer to serve the site as pure static HTML (e.g., via Nginx), follow these steps:

##### 1. Export the project

Open `next.config.mjs` and ensure the following line is present and uncommented:

```ts
const nextConfig = {
  output: "export", // <-- Enable static export
};
```

> ⚠️ This will output the site into a folder named `out/` instead of using the default `.next/`.

Generate the static files:

```sh
yarn build
```

You'll now have an `out/` folder containing all the static files ready to serve.

##### 2. Tweak for Local Usage (Optional)

Opening `out/index.html` directly in a browser **won't work** as-is due to relative path issues, [see this issue on GitHub](https://github.com/vercel/next.js/issues/2581).

But don’t worry, we’ve got you covered!  
If you're just testing locally (not serving via Nginx), you can run the helper script:

```sh
sh transform.sh out/index.html
```

This will patch the necessary paths so that `index.html` works when opened directly.

##### 3. Serve with Nginx (or any static server)

If you're using Nginx, just point the root to the `out/` folder and you're good to go.  
No path fixes or magic scripts needed, it’ll just work !
