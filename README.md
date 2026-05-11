<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# e-iskolcenje

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1O5CLQcDPCemzEMLkASVlDKxTVGXkjd5H

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This project is ready to deploy as a static GitHub Pages app. The Vite config uses `base: './'`, so built assets work from a repository subpath such as `https://username.github.io/repository-name/`.

1. Push the project to GitHub on the `main` branch.
2. In the GitHub repository, open **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push a change to `main`, or run the **Deploy to GitHub Pages** workflow manually from the **Actions** tab.

The workflow builds the app with `npm ci` and `npm run build`, then publishes the `dist` folder to GitHub Pages.
