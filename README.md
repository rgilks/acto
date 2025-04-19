# acto - AI Interactive Storyteller

An interactive storytelling application powered by Next.js and generative AI (Google Gemini).

[![CI/CD](https://github.com/rgilks/acto/actions/workflows/fly.yml/badge.svg)](https://github.com/rgilks/acto/actions/workflows/fly.yml)

_(Placeholder for a new screenshot of the application interface)_

## Overview

`acto` is an AI-powered interactive storytelling application. Users can start with an initial scenario (either chosen or generated) and make choices that influence the direction of the narrative. The application uses Google's Gemini AI models to generate story passages, subsequent choices, and relevant imagery based on the user's input and the story's history. It also features Text-to-Speech (TTS) capabilities to read passages aloud. Audio begins playing automatically when ready.

## Features

- **AI-Generated Narrative**: Unique story passages and scenarios crafted by Google AI (Gemini models) based on user choices and story history (prompt refined for better narrative cohesion and conclusion).
- **Dynamic Choices**: AI generates relevant choices for the user at each step, influencing the story progression.
- **Starting Scenarios**: Generates diverse starting points for new stories across different genres (prompt refined for better variation and conciseness; hardcoded scenarios updated for variety and brevity).
- **AI-Generated Images**: Images created based on the narrative using Imagen via the Gemini API (prompt now explicitly requests first-person perspective, excluding hands).
- **Text-to-Speech (TTS)**: Reads story passages aloud using Google Cloud TTS. Audio begins playing automatically when ready.
- **Stateful Interaction**: The application maintains the story history to provide context for the AI.
- **User Authentication**: (Optional) Secure login via GitHub, Google, and Discord OAuth using NextAuth.
- **Data Persistence**: (Likely, uses SQLite) Store user data or potentially story progress.
- **Responsive Design**: Optimized for both desktop and mobile devices using Tailwind CSS.
- **Modern UI**: Clean interface built with React and Next.js.
- **Enhanced & Responsive Game UI**: Improved image-centric layout that adapts to different screen sizes, featuring integrated minimal audio controls (play/pause, volume), a subtle glow effect, and a fullscreen option to enhance visual immersion.
- **Improved Landscape/Fullscreen View**: Enhanced CSS to provide a near edge-to-edge image experience on mobile devices (like iPhones) in landscape mode (viewport scaling also restricted to prevent unwanted zoom).
- **Robust Validation**: Uses Zod for validating AI responses.
- **State Management**: Uses `zustand` for managing client-side application state.
- **Continuous Deployment**: Automatic deployment to Fly.io via GitHub Actions.
- **Admin Panel**: (Optional) Secure area for administrators to view application data.
- **Testing**: Includes unit/integration tests (Jest) and end-to-end tests (Playwright).
- **Error Tracking**: Sentry integration for monitoring.

## Technology Stack

- **Next.js**: Latest version using App Router
- **React**: Latest major version
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Strong typing for code quality
- **next-auth**: Authentication (GitHub, Google, Discord) _(Optional)_
- **Google Generative AI SDK (`@google/genai`)**: Gemini model integration (Text/Image Generation)
- **Google Cloud Client Libraries (`@google-cloud/text-to-speech`)**: Cloud Text-to-Speech
- **SQLite**: `better-sqlite3` likely for database storage (user data, rate limits)
- **Zod**: Schema validation (especially for AI responses)
- **zustand / immer**: Client-side state management
- **@ducanh2912/next-pwa**: Progressive Web App features
- **@sentry/nextjs**: Error tracking
- **Playwright**: End-to-end testing (typically run locally)
- **Jest / React Testing Library**: Unit/Integration testing
- **ESLint / Prettier**: Linting & Formatting
- **Husky / lint-staged**: Git hooks
- **Fly.io**: Deployment platform
- **Turbopack**: (Optional, used with `npm run dev`)

## Application Flow

1.  **(Optional) Sign in**: Use GitHub, Google, or Discord authentication.
2.  **Start Story**: Choose from AI-generated starting scenarios or begin a default story.
3.  **Receive Passage & Choices**: The AI generates the current part of the story and presents choices.
4.  **Make Choice**: Select an action/dialogue option.
5.  **AI Responds**: The application sends the story history and the user's choice to the AI. The AI generates the outcome, the next passage, and new choices based on the context.
6.  **Repeat**: Continue making choices and progressing the AI-generated narrative.

## API Cost Management & Rate Limiting

acto implements strategies to manage AI API costs:

- **Rate Limiting**:
  - Uses a per-user sliding window counter stored in the `rate_limits_user` SQLite table.
  - Applies separate limits for different Google AI API types (text generation, image generation, TTS).
  - Requires users to be logged in (via NextAuth) to make rate-limited API calls.
  - Default limits are defined in `lib/rateLimitSqlite.ts` (e.g., 10 text requests/min, 5 image requests/hour).
  - Adjust limits directly in `lib/rateLimitSqlite.ts` or consider moving them to environment variables for easier configuration.
  - Exceeding the limit returns an error to the user and logs details to the console and Sentry (if configured).
- **Database Caching**: _(Not currently implemented for adventure game state. Previous caching mechanisms for other features may have been removed.)_

## Setup and Running

### Prerequisites

1.  **Node.js:** Version 20 or higher (Check `.nvmrc`).
2.  **npm:** Package manager (Comes with Node.js).
3.  **Git:** For cloning.
4.  **API Keys & Credentials:** Obtain the necessary keys/secrets for the services you intend to use (see Environment Variables section below).

### Running Locally

1.  **Clone:**
    ```bash
    git clone https://github.com/rgilks/acto.git # Or your fork
    cd acto
    ```
2.  **Install:**

    ```bash
    npm install
    ```

    This command also runs the `prepare` script, which installs Git hooks and may download browser binaries for Playwright tests (skipped in CI environments).

3.  **Configure Environment Variables:**

    - Copy `.env.example` to `.env.local`: `cp .env.example .env.local`
    - Edit `.env.local` and fill in the required values. **See `.env.example` for comments on each variable.**

    **Required for Core Functionality:**

    - `GOOGLE_AI_API_KEY`: For Google AI (Gemini text generation & Imagen image generation via Gemini API). Get from [Google AI Studio](https://aistudio.google.com/app/apikey).
    - `GOOGLE_APPLICATION_CREDENTIALS` (or `GOOGLE_APP_CREDS_JSON` secret): Path to (or JSON content of) your Google Cloud service account key file. Required for Google Cloud services like Cloud Text-to-Speech. See [Google Cloud Authentication Docs](https://cloud.google.com/docs/authentication/provide-credentials-adc#local-dev).

    **Required for Authentication (if used):**

    - `AUTH_SECRET`: Generate with `openssl rand -base64 32`.
    - `NEXTAUTH_URL=http://localhost:3000`
    - OAuth credentials (`GITHUB_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `DISCORD_CLIENT_ID`/`SECRET`) for enabled providers.

    **Required for Deployment/Build Features:**

    - `NEXT_PUBLIC_SENTRY_DSN`: Sentry DSN for client-side error tracking.
    - `SENTRY_AUTH_TOKEN`: Sentry token for build-time source map upload.
    - `SENTRY_ORG`: Your Sentry organization slug.
    - `SENTRY_PROJECT`: Your Sentry project slug.

    **Optional (Remove if not used):**

    - `ADMIN_EMAILS`: For admin panel access.
    - `ALLOWED_EMAILS`: Comma-separated list of additional emails allowed access when the waiting list mode is implicitly active (i.e., if `ALLOWED_EMAILS` is set).
    - `DATABASE_URL`: Optional. Usually not required; database path is typically handled internally (e.g., by LiteFS on Fly.io). See `.env.example` for details.
    - `COMMIT_SHA`: Optional. Used to link Sentry errors to specific code versions. Often injected automatically during the CI/CD build process. See `.env.example`.

4.  **Run Dev Server:**

    ```bash
    npm run dev
    ```

5.  **Open App:** [http://localhost:3000](http://localhost:3000)

### Deploying to Fly.io

This project includes a `Dockerfile`, `fly.toml`, and `entrypoint.sh` configured for deployment on Fly.io. Continuous Deployment via GitHub Actions (`.github/workflows/fly.yml`) is recommended after the initial setup.

**First-Time Fly.io Setup Script:**

The following commands will guide you through the initial setup. Run them in your terminal from the project root directory.

1.  **Install Fly CLI & Login:**

    - Install `flyctl`: [Official Instructions](https://fly.io/docs/hands-on/install-flyctl/)
    - Login to your Fly.io account:
      ```bash
      fly auth login
      ```

2.  **Launch the App (Creates Fly App if it doesn't exist):**

    - This command creates the application on Fly.io, links it to your local directory, but _doesn't_ deploy yet. Adjust the name (`acto`) or region (`lhr`) if desired.
      ```bash
      fly launch --name acto --region lhr --no-deploy --copy-config=false
      ```
    - _(Note: We use `--copy-config=false` because we already have a `fly.toml`)_

3.  **Create Persistent Volume for Database:**

    - This creates a 1GB persistent volume named `data` where the SQLite database will live.
      ```bash
      fly volumes create data --region lhr --size 1 --app acto
      ```

4.  **Set Secrets:**

    - **Crucial - Google Cloud Credentials:** Set your service account JSON key content as a secret. Paste the _entire JSON content_ when prompted.
      ```bash
      echo "Paste your entire Google Cloud Service Account JSON key content here, then press Enter:"
      read -s GOOGLE_APP_CREDS_JSON_CONTENT && fly secrets set GOOGLE_APP_CREDS_JSON="$GOOGLE_APP_CREDS_JSON_CONTENT" --app acto
      # (Ensure the content is pasted correctly within quotes if not using the read command)
      ```
    - **Other Secrets:** Create a `.env.production` file locally (copy from `.env.example`, **DO NOT COMMIT**). Fill in all other required production keys/tokens (`GOOGLE_AI_API_KEY`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_SENTRY_DSN`, `AUTH_SECRET`, `NEXTAUTH_URL=https://acto.fly.dev`). Then import them:
      ```bash
      # Ensure .env.production is populated with production values!
      # Required: GOOGLE_AI_API_KEY, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, NEXT_PUBLIC_SENTRY_DSN
      # Required if using Auth: AUTH_SECRET, NEXTAUTH_URL=https://<your-fly-app-name>.fly.dev, Provider secrets
      fly secrets import --app acto < .env.production
      ```
    - **Important `NEXTAUTH_URL` Note:** For OAuth providers (Google, GitHub, Discord) to work correctly in production, the `NEXTAUTH_URL` secret **must** be set to the full base URL of your deployed application (e.g., `https://acto.fly.dev`). This is crucial for OAuth redirects.
    - **Verify Secrets:** Check required secrets are listed (run `fly secrets list --app acto`). Ensure `GOOGLE_AI_API_KEY`, `GOOGLE_APP_CREDS_JSON`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_SENTRY_DSN` are present. Also check `AUTH_SECRET` and `NEXTAUTH_URL` if using authentication. Check `ADMIN_EMAILS` and `ALLOWED_EMAILS` if those features are used.

5.  **Deploy the Application:**

    - This builds the Docker image using the local `Dockerfile` and deploys it.
      ```bash
      fly deploy --app acto
      ```

6.  **(Optional) Setup GitHub Actions for CI/CD:**
    - Get a Fly API token:
      ```bash
      fly auth token
      ```
    - Go to your GitHub repository > Settings > Secrets and variables > Actions.
    - Create a new repository secret named `FLY_API_TOKEN` and paste the token value.
    - Pushes to the `main` branch should now trigger automatic deployments via the `.github/workflows/fly.yml` workflow.

**Subsequent Deployments:**

- If CI/CD is set up: `git push origin main`
- Manually: `fly deploy --app acto`

## Key Features Explained

### Waiting List Mode

`acto` can be configured to operate in a restricted access mode, functioning like a waiting list system.

- **Activation**: This mode is implicitly activated whenever the `ALLOWED_EMAILS` environment variable is set and contains at least one email address.
- **Access Control**: When active, only users whose email addresses are present in _either_ the `ALLOWED_EMAILS` or `ADMIN_EMAILS` environment variables will be allowed to sign in or complete the sign-up process.
- **User Experience**: Users attempting to sign in who are not on either list will be redirected to a `/pending-approval` page indicating they are on the waiting list.
- **Configuration**:
  - Add non-admin allowed emails to the `ALLOWED_EMAILS` variable in your `.env.local` file (for local development) or as a Fly.io secret (for production), separated by commas.
  - Add admin emails to the `ADMIN_EMAILS` variable (these users gain access regardless of the `ALLOWED_EMAILS` list).
  - **Important**: If you update these secrets on Fly.io, you **must redeploy** the application (`fly deploy`) for the changes to take effect.
- **Disabling**: To allow anyone to sign up, simply leave the `ALLOWED_EMAILS` environment variable unset or empty.

### Static Starting Scenarios (Logged-Out Users)

To improve performance and reduce unnecessary API calls for visitors who are not logged in, the application now displays a static, hardcoded list of starting scenarios (`app/components/AdventureGame.tsx`). These have been updated to offer a more diverse and concise set of unique starting points.

### Progressive Web App (PWA)

The application is configured as a PWA using `@ducanh2912/next-pwa`. Users on compatible browsers may be prompted to install the app to their home screen or desktop via a custom, styled prompt (`app/components/PWAInstall.tsx`) for easier access and a more app-like experience.

## Development Workflow

Key scripts defined in `package.json`:

```bash
# Run dev server (with Turbopack)
npm run dev

# Build for production
npm run build

# Start production server locally
npm run start

# Check formatting & linting
npm run verify

# Fix formatting & linting, run type checks, unit tests, e2e tests
npm run check

# Run unit/integration tests (Jest)
npm run test

# Run Jest in watch mode
npm run test:watch

# Run end-to-end tests (Playwright)
npm run test:e2e

# Check for dependency updates
npm run deps

# Update dependencies interactively
npm run deps:update

# Remove node_modules, lockfile, build artifacts
npm run nuke
```

### Testing Strategy

- **Co-location**: Test files (`*.test.ts`, `*.test.tsx`) live alongside the source files they test.
- **Unit/Integration**: Jest and React Testing Library (`npm test`) test components and utility functions.
- **End-to-End**: Playwright (`npm run test:e2e`) checks full user flows through the adventure game. See E2E Authentication Setup below if testing authenticated features.
- **Git Hooks**: Husky and lint-staged automatically run checks:
  - **Pre-commit**: Formats staged files (`prettier`) and runs related Jest tests (`test:quick`).
  - **Pre-push**: Runs `npm run preview-build` to ensure a preview build succeeds before pushing. _(See `.husky/pre-push`)_

## Production Considerations

- **AI Costs**: Monitor Google AI/Cloud dashboards closely for usage and costs.
- **Rate Limits**: Adjust limits based on expected traffic, budget, and AI response times.
- **Security**: Review input handling, especially if user input influences AI prompts. Consider authentication/authorization for saving stories.
- **Scalability**: Adjust Fly.io machine specs/count in `fly.toml`. Database performance might become a factor if storing large amounts of story history.
- **Database Backups**: Implement a backup strategy for the SQLite volume on Fly.io.
- **Sentry**: Ensure DSN and other variables are configured for production error tracking.
- **Prompt Engineering**: Continuously refine prompts in `app/actions/adventure.ts` for better narrative quality, consistency, and JSON adherence.

## Customization

- **AI Prompts**: Adjust prompts within `buildAdventurePrompt` and `generateStartingScenariosAction` in `app/actions/adventure.ts` to change the storytelling style, tone, genre focus, etc.
- **Story Structure**: Modify the requested JSON structure in prompts and the corresponding Zod schemas (`lib/domain/schemas.ts`) if different story elements are desired.
- **UI/UX**: Modify Tailwind classes and component structure in `app/components/`.
- **Rate Limits**: Adjust limits in the relevant action files.
- **Auth Providers**: Add/remove providers in `lib/authOptions.ts` (or equivalent auth setup file) and update environment variables.

## Code Structure

```
/
├── app/                      # Next.js App Router
│   ├── [lang]/               # Language-specific routes (if i18n is kept)
│   │   ├── page.tsx          # Main game page component
│   │   └── layout.tsx        # Layout for game routes
│   ├── actions/              # Server Actions
│   │   └── adventure.ts      # Core game logic, AI interaction, state updates
│   │   └── tts.ts            # Text-to-speech action (optional)
│   ├── api/                  # API routes (e.g., auth callbacks)
│   ├── components/           # Shared React components (UI elements)
│   ├── store/                # Zustand state stores (e.g., adventureStore)
│   ├── admin/                # Admin panel components/routes (optional)
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Root page (e.g., landing or redirect)
│   └── globals.css           # Global styles
├── lib/                      # Shared libraries/utilities
│   ├── db.ts                 # Database connection & schema setup (verify schema)
│   ├── authOptions.ts        # NextAuth configuration (if used)
│   ├── modelConfig.ts        # AI model configuration & selection
│   ├── domain/               # Domain schemas (Zod, e.g., AdventureNodeSchema)
│   └── ...
├── public/                   # Static assets (images, icons)
├── data/                     # SQLite database file (local development)
├── docs/                     # Documentation files (e.g., state diagrams - review relevance)
├── test/                     # Test configurations and utilities
│   └── e2e/                  # Playwright E2E tests & auth state
├── .env.example              # Example environment variables
├── next.config.js            # Next.js configuration (verify filename)
├── tailwind.config.js        # Tailwind CSS configuration (verify filename)
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest configuration
├── playwright.config.js      # Playwright configuration (verify filename)
├── fly.toml / Dockerfile     # Deployment configuration
├── package.json              # Project dependencies and scripts
└── README.md                 # This file
```

## Contributing

Contributions welcome!

1.  Fork the repository.
2.  Create branch: `git checkout -b feature/your-feature`.
3.  Commit changes: `git commit -m 'Add cool adventure element'`.
4.  Push: `git push origin feature/your-feature`.
5.  Open Pull Request.

## Admin Panel

Accessible at `/admin` for users whose email is in `ADMIN_EMAILS`.

**Features:**

- View data from `users`, `rate_limits_user`, potentially game state or feedback tables. _(Verify available tables)_
- Basic pagination.
- Requires login; redirects non-admins.

**Setup:**

- Set `ADMIN_EMAILS` environment variable locally (`.env.local`) and in deployment (e.g., Fly.io secrets), comma-separated.

### E2E Test Authentication Setup

_(This section is likely still relevant if testing features requiring login, like the admin panel or potentially user-specific game saves. Review `test/e2e/` tests.)_

Certain Playwright end-to-end tests (especially those involving `/admin` access or user-specific behavior) may require pre-generated authentication state to simulate logged-in users.

These state files (`test/e2e/auth/*.storageState.json`) contain session information and are **not** committed to Git.

**Prerequisites:**

- At least one OAuth provider (GitHub, Google, Discord) is configured in your `.env.local`.
- The `ADMIN_EMAILS` variable is set in your `.env.local` with the email of your designated admin test user.
- You have access to both an admin test account and a non-admin test account for one of the configured OAuth providers.

**To generate the state files locally:**

1.  **Ensure Files Exist:** If they don't already exist, create empty files named exactly:
    - `test/e2e/auth/admin.storageState.json`
    - `test/e2e/auth/nonAdmin.storageState.json`
2.  **Run App:** Start the development server:
    ```bash
    npm run dev
    ```
3.  **Login as Admin:** Navigate to `http://localhost:3000` and log in as the **admin** user.
4.  **Get Admin Cookie:** Open browser dev tools, go to Application/Storage > Cookies, copy the **value** of the `next-auth.session-token` cookie (or equivalent session cookie).
5.  **Update `admin.storageState.json`:** Paste the token value, replacing the placeholder:
    ```json
    {
      "cookies": [
        {
          "name": "next-auth.session-token", // Verify cookie name
          "value": "YOUR_ADMIN_TOKEN_VALUE_HERE",
          "domain": "localhost",
          "path": "/",
          "expires": -1,
          "httpOnly": true,
          "secure": false,
          "sameSite": "Lax"
        }
      ],
      "origins": []
    }
    ```
6.  **Log Out & Login as Non-Admin:** Log out, then log in as a regular **non-admin** user.
7.  **Get Non-Admin Cookie:** Repeat step 4 for the non-admin user.
8.  **Update `nonAdmin.storageState.json`:** Paste the non-admin token value, replacing the placeholder, using the same JSON structure.

**Verification:** `npm run test:e2e` should now pass tests requiring authentication.

**Troubleshooting:** Check cookie names, values, and JSON structure validity.

## Database

Uses SQLite via `better-sqlite3`. The database file is `data/acto.sqlite` locally, and stored on a persistent volume (`/data/acto.sqlite`) in production (Fly.io).

### SQLite Command Line (Local)

```bash
# Navigate to project root
sqlite3 data/acto.sqlite
```

Useful commands: `.tables`, `SELECT * FROM users LIMIT 5;`, `.schema`, `.quit`.

### Database Schema

_(Review `lib/db.ts` for the definitive schema. The example below reflects the core tables.)_

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  name TEXT,
  email TEXT,
  image TEXT,
  first_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  language TEXT DEFAULT 'en',
  UNIQUE(provider_id, provider)
);

CREATE TABLE IF NOT EXISTS rate_limits_user (
  user_id INTEGER NOT NULL,
  api_type TEXT NOT NULL, -- e.g., 'text', 'image', 'tts'
  window_start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, api_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Example: Potential table for saved stories (Needs verification)
/*
CREATE TABLE IF NOT EXISTS saved_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_history TEXT NOT NULL, -- JSON blob of StoryContext?
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  story_title TEXT
);
*/

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_window ON rate_limits_user(user_id, api_type, window_start_time DESC);
-- CREATE INDEX IF NOT EXISTS idx_saved_stories_user_id ON saved_stories(user_id); -- If table exists
```

## Troubleshooting

- **Database Connection:** Ensure `data/` dir exists locally. On Fly, check volume mount (`fly.toml`) and status (`fly status`). Verify schema matches code.
- **Auth Errors:** Verify `.env.local` / Fly secrets (`AUTH_SECRET`, provider IDs/secrets, `NEXTAUTH_URL`). Ensure OAuth callback URLs match.
- **API Key Errors:** Check AI provider keys in env/secrets. Ensure billing/quotas are sufficient. Check `lib/modelConfig.ts`.
- **AI Errors:** Check Sentry/console logs for errors from the AI API. Ensure the AI is returning valid JSON matching the expected Zod schema in `app/actions/adventure.ts`. Refine prompts if needed.
- **Rate Limit Errors:** Wait for the window to reset or adjust limits in `lib/rateLimitSqlite.ts` if necessary. Check `rate_limits_user` table for current counts.
- **Admin Access Denied:** Confirm logged-in user's email is EXACTLY in `ADMIN_EMAILS`. Check Fly secrets value.
- **Deployment Issues:** Examine GitHub Actions logs and `fly logs --app <your-app-name>`.
- **State Management Issues:** Use React DevTools/Zustand DevTools to inspect game state.

## License

MIT License. See [LICENSE](LICENSE) file.
