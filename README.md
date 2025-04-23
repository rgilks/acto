# acto - AI Interactive Storyteller

An interactive storytelling application powered by Next.js and Google's generative AI models.

[![CI/CD](https://github.com/rgilks/acto/actions/workflows/fly.yml/badge.svg)](https://github.com/rgilks/acto/actions/workflows/fly.yml)

![acto Screenshot](/public/screenshot.png)

<div align="center">
  <a href='https://ko-fi.com/N4N31DPNUS' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
</div>

## Overview

`acto` is an AI-powered interactive storytelling application. Users can start with an initial scenario (either chosen or generated) and make choices that influence the direction of the narrative. The application uses Google's generative AI models (via the `@google/genai` SDK) to generate story passages, subsequent choices, and relevant imagery based on the user's input and the story's history. It also features Text-to-Speech (TTS) capabilities using Google Cloud TTS to read passages aloud.

## Features

- **AI-Generated Narrative**: Unique story passages and scenarios crafted by Google AI (via `@google/genai`) based on user choices and story history (prompt refined for coherence and engaging descriptions).
- **Dynamic Choices**: AI generates 3 relevant, distinct choices for the player at each step, influencing the story progression.
- **Starting Scenarios**: Generates diverse starting points for new stories across different genres (prompt refined for variation and conciseness).
- **AI-Generated Images**: Images generated (via `@google/genai`) based on the narrative content, reflecting the specified genre, tone, and visual style.
- **Text-to-Speech (TTS)**: Reads story passages aloud using Google Cloud TTS. Audio begins playing automatically when ready.
- **Stateful Interaction**: The application maintains the story history (summary + recent steps) to provide context for the AI.
- **User Authentication**: (Optional) Secure login via GitHub, Google, and Discord OAuth using NextAuth.
- **Rate Limiting**: Per-user daily limits for AI text, image, and TTS generation implemented using SQLite.
- **Data Persistence**: Uses SQLite (`better-sqlite3`) for user data and rate limit tracking.
- **Responsive Design**: Optimized for both desktop and mobile devices using Tailwind CSS.
- **Modern UI**: Clean interface built with React and Next.js.
- **Enhanced & Responsive Story UI**: Image-centric layout adapting to different screen sizes, integrated minimal audio controls, subtle glow effect, and fullscreen option.
- **Improved Landscape/Fullscreen View**: Enhanced CSS for near edge-to-edge image experience on mobile landscape.
- **Robust Validation**: Uses Zod for validating AI responses.
- **State Management**: Uses `zustand` with `immer` and `persist` (custom pruning localStorage) for managing client-side application state.
- **Continuous Deployment**: Automatic deployment to Fly.io via GitHub Actions.
- **Admin Panel**: (Optional) Secure area for administrators to view application data.
- **Testing**: Includes unit/integration tests (Vitest) and end-to-end tests (Playwright).

### Saving Your Story

You can save your current story progress at any time using the "Save Story" option in the user menu (available when logged in).

This will download a `.zip` file containing:

- **`story.json`**: A structured representation of your story history, including passages, summaries, choice text, and media file references.
- **`prompt_log.json`**: A log file detailing the prompts sent to the LLM and the key parts of the response (passage, choices, image prompt, summary) for each step. Useful for debugging or understanding AI behavior.
- **`media/` folder**: Contains the generated images (`.png`) and audio files (`.mp3`) for each step.

## Technology Stack

- **Next.js**: Latest version using App Router
- **React**: Latest major version
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Strong typing for code quality
- **next-auth**: Authentication (GitHub, Google, Discord) _(Optional)_
- **`@google/genai`**: Google AI SDK integration (Text & Image Generation)
- **`@google-cloud/text-to-speech`**: Google Cloud Text-to-Speech
- **SQLite (`better-sqlite3`)**: Database storage (user data, rate limits)
- **Zod**: Schema validation (especially for AI responses)
- **zustand / immer / zustand/middleware**: Client-side state management with persistence
- **@ducanh2912/next-pwa**: Progressive Web App features
- **Playwright**: End-to-end testing
- **Vitest / React Testing Library**: Unit/Integration testing
- **ESLint / Prettier**: Linting & Formatting
- **Husky / lint-staged**: Git hooks
- **Fly.io**: Deployment platform
- **Turbopack**: (Optional, used with `npm run dev`)

## Application Flow

1.  **(Optional) Sign in**: Use GitHub, Google, or Discord authentication.
2.  **Start Story**: Choose from AI-generated starting scenarios or begin a default story.
3.  **Receive Passage & Choices**: The AI generates the current part of the story and presents 3 choices.
4.  **Make Choice**: Select an action/dialogue option.
5.  **AI Responds**: The application sends the relevant story history (summary + recent steps) and style context to the AI. The AI generates the outcome, the next passage, new choices, an image prompt, and an updated summary.
6.  **Repeat**: Continue making choices and progressing the AI-generated narrative.

## Prompt Engineering Highlights

The quality of the generated story heavily relies on the prompts sent to the AI. Key strategies include:

- **Structured Output**: Requesting responses in a specific JSON format using Zod schemas for validation ensures predictable data handling.
- **Contextual Awareness**: The prompt dynamically includes:
  - **Style Hints**: Genre, Tone, and Visual Style selections.
  - **Long-Term Context**: The AI's previously generated summary of the story so far.
  - **Short-Term Context**: The passages and choices from the last 5 steps.
- **Targeted Instructions**: Explicit instructions guide the AI on generating engaging passages, distinct choices, relevant image prompts (matching the passage, genre, tone, and style), and concise summaries.
- **Efficiency**: Initial scenario context is only included in the very first prompt to avoid redundancy.

## API Cost Management & Rate Limiting

`acto` implements strategies to manage AI API costs:

- **Rate Limiting**:
  - Uses a per-user **daily counter** stored in the `rate_limits_user` SQLite table (resets at UTC midnight).
  - Applies separate limits for different Google API types (text generation via `@google/genai`, image generation via `@google/genai`, and Google Cloud TTS).
  - Requires users to be logged in (via NextAuth) to make rate-limited API calls.
  - Default limits are defined in `lib/rateLimitSqlite.ts` (e.g., **100** text requests/day, **100** image requests/day, **100** TTS requests/day).
  - Adjust limits directly in `lib/rateLimitSqlite.ts` or consider moving them to environment variables.
  - Exceeding the limit returns an error to the user and logs details.
- **Payload Optimization**: Only essential history data (passage, choice, summary) is sent from the client to the server action to avoid exceeding payload size limits.

## Setup and Running

### Prerequisites

1.  **Node.js:** Version 20 or higher (Check `.nvmrc`).
2.  **npm:** Package manager.
3.  **Git:** For cloning.
4.  **API Keys & Credentials:** Obtain necessary keys/secrets (see Environment Variables below).

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

    Installs dependencies.

3.  **Initialize Development Environment (First Time):**

    After installing dependencies for the first time, run:

    ```bash
    npm run init:dev
    ```

    This script performs essential one-time setup for local development:

    - Installs Git hooks using Husky (for pre-commit/pre-push checks).
    - Downloads the necessary browser binaries for Playwright end-to-end tests.

4.  **Configure Environment Variables:**

    - Copy `.env.example` to `.env.local`: `cp .env.example .env.local`
    - Edit `.env.local` and fill in the required values. **See `.env.example` for comments.**

    **Required for Core Functionality:**

    - `GOOGLE_AI_API_KEY`: For Google AI (`@google/genai` SDK - used for both Text & Image generation). Get from [Google AI Studio](https://aistudio.google.com/app/apikey).
    - `GOOGLE_APP_CREDS_JSON`: Contains the **single-line** JSON content of your Google Cloud service account key file. **Required for Cloud Text-to-Speech**. Generate the single line using `jq -c . < /path/to/your/keyfile.json` and paste the raw output into `.env.local`.

    **Required for Authentication (if used):**

    - `AUTH_SECRET`: Generate with `openssl rand -base64 32`.
    - `NEXTAUTH_URL=http://localhost:3000`
    - OAuth credentials (`GITHUB_ID`/`SECRET`, etc.) for enabled providers.

    **Optional (Remove if not used):**

    - `ADMIN_EMAILS` / `ALLOWED_EMAILS`: For admin/waiting list access.

5.  **Run Dev Server:**

    ```bash
    npm run dev
    ```

6.  **Open App:** [http://localhost:3000](http://localhost:3000)

### Deploying to Fly.io

This application is configured for **automatic deployment** to Fly.io via a GitHub Actions workflow (`.github/workflows/fly.yml`).

**Deployment Process:**

1.  **Trigger:** Deployments are automatically triggered on every push to the `main` branch. You can also trigger a deploy manually via the "Actions" tab in GitHub ("Fly Deploy" workflow -> "Run workflow").
2.  **Workflow Steps:** The GitHub Action will:
    - Check out the code.
    - Set up Node.js and install dependencies using `npm ci`.
    - Run code quality checks (`npm run verify`) and tests (`npm test`).
    - Set up the `flyctl` CLI.
    - Deploy the application using `flyctl deploy --remote-only`, building the Docker image on Fly.io's infrastructure.
3.  **Secrets:** The deployment requires the `FLY_API_TOKEN` secret to be configured in your GitHub repository settings (`Settings` > `Secrets and variables` > `Actions`).

**Required Application Secrets on Fly.io:**

Ensure the following secrets are set on your Fly.io app dashboard (`fly secrets set <KEY>=<VALUE>`). These are needed by the running application, not the build process itself:

- `GOOGLE_AI_API_KEY`: For Google AI SDK.
- `GOOGLE_APP_CREDS_JSON`: Single-line JSON service account key for Cloud TTS.
- `AUTH_SECRET`: Required if using NextAuth (`openssl rand -base64 32`).
- `NEXTAUTH_URL=https://<your-fly-app-name>.fly.dev`: Required if using NextAuth.
- OAuth Provider Secrets (`GITHUB_ID`, `GITHUB_SECRET`, etc.): Required for specific NextAuth providers.
- `ADMIN_EMAILS` / `ALLOWED_EMAILS`: Optional, for restricted access modes.

**(Manual Deployment):** While automated deployment is recommended, you can still deploy manually from your local machine using `fly deploy` after logging in with `fly auth login` and ensuring your local `.fly/launch.toml` is configured. Remember to set the required secrets locally as well if building locally.

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

To improve performance and reduce unnecessary API calls for visitors who are not logged in, the application now displays a static, hardcoded list of starting scenarios (`app/components/StoryStory.tsx`). These have been updated to offer a more diverse and concise set of unique starting points.

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

# Run unit/integration tests (Vitest)
npm run test

# Run Vitest in watch mode
npm run test:watch

# Run Vitest with coverage report
npm run test:coverage

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
- **Unit/Integration**: Vitest and React Testing Library (`npm test`) test components and utility functions.
- **End-to-End**: Playwright (`npm run test:e2e`) checks full user flows through the story.
  - See E2E Authentication Setup below if testing authenticated features.
- **Git Hooks**: Husky and lint-staged automatically run checks:
  - **Pre-commit**: Formats staged files (`prettier`) and runs related Vitest tests (`test:quick`).
  - **Pre-push**: Runs `npm run preview-build` to ensure a preview build succeeds before pushing. _(See `.husky/pre-push`)_

## Production Considerations

- **AI Costs**: Monitor Google AI/Cloud dashboards closely for usage and costs.
- **Rate Limits**: Adjust limits based on expected traffic, budget, and AI response times.
- **Security**: Review input handling, especially if user input influences AI prompts. Consider authentication/authorization for saving stories.
- **Scalability**: Adjust Fly.io machine specs/count in `fly.toml`. Database performance might become a factor if storing large amounts of story history.
- **Database Backups**: Implement a backup strategy for the SQLite volume on Fly.io.
- **Prompt Engineering**: Continuously refine prompts in `app/actions/story.ts` for better narrative quality, consistency, and JSON adherence.

## Customization

- **AI Prompts**: Adjust prompts within `buildStoryPrompt` and `generateStartingScenariosAction` in `app/actions/story.ts` to change the storytelling style, tone, genre focus, etc.
- **Story Structure**: Modify the requested JSON structure in prompts and the corresponding Zod schemas (`lib/domain/schemas.ts`) if different story elements are desired.
- **UI/UX**: Modify Tailwind classes and component structure in `app/components/`.
- **Rate Limits**: Adjust limits in the relevant action files.
- **Auth Providers**: Add/remove providers in `lib/authOptions.ts` (or equivalent auth setup file) and update environment variables.

## Code Structure

```
/
├── app/                      # Next.js App Router
│   ├── [lang]/               # Language-specific routes (if i18n is kept)
│   │   ├── page.tsx          # Main story page component
│   │   └── layout.tsx        # Layout for story routes
│   ├── actions/              # Server Actions
│   │   └── story.ts      # Core story logic, AI interaction, state updates
│   │   └── tts.ts            # Text-to-speech action (optional)
│   ├── api/                  # API routes (e.g., auth callbacks)
│   ├── components/           # Shared React components (UI elements)
│   ├── store/                # Zustand state stores (e.g., storyStore)
│   ├── admin/                # Admin panel components/routes (optional)
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Root page (e.g., landing or redirect)
│   └── globals.css           # Global styles
├── lib/                      # Shared libraries/utilities
│   ├── db.ts                 # Database connection & schema setup (verify schema)
│   ├── authOptions.ts        # NextAuth configuration (if used)
│   ├── modelConfig.ts        # AI model configuration & selection
│   ├── domain/               # Domain schemas (Zod, e.g., StorySceneSchema)
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
├── playwright.config.js      # Playwright configuration (verify filename)
├── fly.toml / Dockerfile     # Deployment configuration
├── package.json              # Project dependencies and scripts
└── README.md                 # This file
```

## Contributing

Contributions welcome!

1.  Fork the repository.
2.  Create branch: `git checkout -b feature/your-feature`.
3.  Commit changes: `git commit -m 'Add cool story element'`.
4.  Push: `git push origin feature/your-feature`.
5.  Open Pull Request.

## Admin Panel

Accessible at `/admin` for users whose email is in `ADMIN_EMAILS`.

**Features:**

- View data from `users` and `rate_limits_user` tables.
- Basic pagination.
- Requires login; redirects non-admins.

**Setup:**

- Set `ADMIN_EMAILS` environment variable locally (`.env.local`) and in deployment (e.g., Fly.io secrets), comma-separated.

### E2E Test Authentication Setup

_(This section is relevant if testing features requiring login, like the admin panel or user-specific story saves. Review `test/e2e/` tests.)_

Certain Playwright end-to-end tests (especially those involving `/admin` access or user-specific behavior) require pre-generated authentication state to simulate logged-in users.

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
4.  **Get Admin Cookie:** Open browser dev tools, go to Application/Storage > Cookies for `localhost`. Find the session cookie (e.g., `next-auth.session-token` or potentially `authjs.session-token` - **verify the exact name**) and copy its **value**.
5.  **Update `admin.storageState.json`:** Paste the copied token value, replacing the placeholder `YOUR_ADMIN_TOKEN_VALUE_HERE`. Ensure the `name` property matches the actual cookie name you found.
    ```json
    {
      "cookies": [
        {
          "name": "next-auth.session-token", // VERIFY THIS COOKIE NAME IN YOUR BROWSER
          "value": "YOUR_ADMIN_TOKEN_VALUE_HERE",
          "domain": "localhost",
          "path": "/",
          "expires": -1, // Or the actual expiration timestamp if not -1
          "httpOnly": true,
          "secure": false,
          "sameSite": "Lax" // Verify sameSite if necessary
        }
      ],
      "origins": []
    }
    ```
6.  **Log Out & Login as Non-Admin:** Log out, then log in as a regular **non-admin** user.
7.  **Get Non-Admin Cookie:** Repeat step 4 for the non-admin user, verifying the cookie name and copying its value.
8.  **Update `nonAdmin.storageState.json`:** Paste the non-admin token value, replacing the placeholder, using the same JSON structure and verifying the cookie name.

**Verification:** `npm run test:e2e` should now pass tests requiring authentication.

**Troubleshooting:** Double-check cookie names, values, domain (`localhost`), path (`/`), and ensure the JSON structure is valid.

## Database

Uses SQLite via `better-sqlite3`. The database file is `data/acto.sqlite` locally, and stored on a persistent volume (`/data/acto.sqlite`) in production (Fly.io).

### SQLite Command Line (Local)

```bash
# Navigate to project root
sqlite3 data/acto.sqlite
```

Useful commands: `.tables`, `SELECT * FROM users LIMIT 5;`, `.schema`, `.quit`.

### Database Schema

See `lib/db.ts` for the definitive schema initialization code. The core tables include:

```sql
-- Users table
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

-- Rate Limiting table per user/api_type
CREATE TABLE IF NOT EXISTS rate_limits_user (
  user_id INTEGER NOT NULL,
  api_type TEXT NOT NULL, -- e.g., 'text', 'image', 'tts'
  window_start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, api_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_window ON rate_limits_user(user_id, api_type, window_start_time DESC);
```

_(Note: A `saved_stories` table might exist if that feature is implemented; check `lib/db.ts`.)_

## Troubleshooting

- **Database Connection:** Ensure `data/` dir exists locally. On Fly, check volume mount (`fly.toml`) and status (`fly status`). Verify schema in `lib/db.ts` matches code expectations.
- **Auth Errors:** Verify `.env.local` / Fly secrets (`AUTH_SECRET`, provider IDs/secrets, `NEXTAUTH_URL`). Ensure OAuth callback URLs match.
- **API Key Errors:** Check AI provider keys in env/secrets. Ensure billing/quotas are sufficient. Check `lib/modelConfig.ts`.
- **AI Errors:** Check console logs for errors from the AI API. Ensure the AI is returning valid JSON matching the expected Zod schema in `app/actions/story.ts`. Refine prompts if needed.
- **Rate Limit Errors:** Wait for the daily limit to reset (UTC midnight) or adjust limits in `lib/rateLimitSqlite.ts` if necessary. Check `rate_limits_user` table for current counts.
- **Admin Access Denied:** Confirm logged-in user's email is EXACTLY in `ADMIN_EMAILS`. Check Fly secrets value.
- **Deployment Issues:** Examine GitHub Actions logs and `fly logs --app <your-app-name>`.
- **State Management Issues:** Use React DevTools/Zustand DevTools to inspect story state.

## License

MIT License. See [LICENSE](LICENSE) file.

- **Accessibility Fix**: Resolved an `aria-hidden` focus issue related to the user menu dropdown.

_(End of File)_
