# acto - AI Dungeon Adventure

An interactive text-based adventure game powered by Next.js and generative AI (OpenAI/Google Gemini).

[![CI/CD](https://github.com/rgilks/acto/actions/workflows/fly.yml/badge.svg)](https://github.com/rgilks/acto/actions/workflows/fly.yml)

_(Placeholder for a new screenshot of the adventure game interface)_

## Overview

`acto` is an AI-powered interactive fiction game where players explore a dangerous dungeon, make choices, and face challenges generated dynamically by AI. Navigate through interconnected rooms, encounter creatures like a roaming ogre, manage your health, and try to survive the adventure. The narrative and available actions adapt based on player choices and the evolving game state.

## Features

- **AI-Generated Narrative**: Unique descriptions and scenarios crafted by OpenAI (GPT models) or Google AI (Gemini models) for each step of the adventure.
- **Dynamic Choices**: Player actions influence the story progression and available options.
- **Interactive Exploration**: Navigate a defined dungeon layout with distinct rooms and connections.
- **Combat System**: Engage in turn-based encounters with enemies like the roaming ogre, managing player health and wounds.
- **Stateful Gameplay**: The game remembers player health, enemy status, and location between actions.
- **Multi-model Support**: Switch between different AI providers (OpenAI/Google) via environment variables.
- **User Authentication**: (Optional) Secure login via GitHub, Google, and Discord OAuth using NextAuth.
- **Data Persistence**: (Likely, uses SQLite) Store game progress or user preferences. _(Verify specific usage)_
- **Responsive Design**: Optimized for both desktop and mobile devices using Tailwind CSS.
- **Modern UI**: Clean interface with potential for visual feedback and animations.
- **Robust Validation**: Uses Zod for validating AI responses and potentially API requests.
- **State Management**: Uses `zustand` for managing client-side game state.
- **Continuous Deployment**: Automatic deployment to Fly.io via GitHub Actions.
- **Admin Panel**: (Optional) Secure area for administrators to view application data (users, potentially game logs).
- **Testing**: Includes unit/integration tests (Jest) and end-to-end tests (Playwright).
- **Error Tracking**: Sentry integration for monitoring.
- **Text-to-Speech**: (Optional) Listen to passages using browser TTS capabilities.

* **State Diagram**: (Potentially needs update) Visual representation of the game state flow. [View State Diagram](docs/text_generator_state_diagram.md) _(Review if this diagram is still relevant)_

## Technology Stack

- **Next.js**: Latest version using App Router
- **React**: Latest major version
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Strong typing for code quality
- **next-auth**: Authentication (GitHub, Google, Discord) _(Optional)_
- **OpenAI SDK**: GPT model integration
- **Google Generative AI SDK**: Gemini model integration
- **SQLite**: `better-sqlite3` likely for database storage (user data, saved games?)
- **Zod**: Schema validation (especially for AI responses)
- **zustand**: Client-side state management
- **@sentry/nextjs**: Error tracking
- **Playwright**: End-to-end testing
- **Jest / React Testing Library**: Unit/Integration testing
- **ESLint / Prettier**: Linting & Formatting
- **Husky / lint-staged**: Git hooks
- **Fly.io**: Deployment platform
- **Turbopack**: (Optional, used with `npm run dev`)

## Gameplay Loop

1.  **(Optional) Sign in**: Use GitHub, Google, or Discord authentication.
2.  **Start Adventure**: Begin the game, likely placed in the starting room (`Entrance Chamber`).
3.  **Receive Description**: The AI generates a description of the current room and situation, including any encounters (like the ogre).
4.  **Make Choice**: Select an action from the provided choices (e.g., move to another room, interact with an object, attack, flee).
5.  **AI Responds**: The game sends the current state and choice to the AI, which generates the outcome, updates the game state (player/enemy health, location), and presents the new situation and choices.
6.  **Repeat**: Continue exploring, fighting, and making choices until the adventure concludes (e.g., player death, achieving a goal).

## API Cost Management & Rate Limiting

acto implements strategies to manage AI API costs:

- **Rate Limiting**:
  - Uses a fixed-window counter based on IP address, stored in the `rate_limits` SQLite table.
  - Default limit: **100 requests per hour** per IP to the adventure generation action (`app/actions/adventure.ts`). _(Verify exact limits and implementation details)_
  - Applies to all users (anonymous and logged-in).
  - Exceeding the limit logs a warning to Sentry (if configured).
  - Adjust limits in relevant action files if needed.
- **Database Caching**: _(Review if applicable)_
  - Previous implementation cached language exercises. It's unclear if game states or AI responses are currently cached. Caching might be less applicable to a dynamic adventure but could be implemented for specific scenarios.
- **Multi-model Support**: Easily switch between OpenAI and Google AI models via the `ACTIVE_MODEL` environment variable to leverage different cost structures.

## Setup and Running

### Prerequisites

1.  **Node.js:** Version 18 or higher (Check `.nvmrc` or project docs).
2.  **npm or yarn:** Package manager.
3.  **Git:** For cloning.
4.  **API Keys & Credentials:**
    - **OpenAI:** [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
    - **Google AI:** [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
    - **GitHub OAuth App:** [github.com/settings/developers](https://github.com/settings/developers) _(Optional)_
    - **Google Cloud OAuth Credentials:** [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) _(Optional)_
    - **Discord OAuth App:** [discord.com/developers/applications](https://discord.com/developers/applications) _(Optional)_
    - _(Optional Deployment)_ [Fly.io Account](https://fly.io/) & [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).

### Running Locally

1.  **Clone:**
    ```bash
    git clone https://github.com/your-username/acto.git # Replace if forked
    cd acto
    ```
2.  **Install:**

    ```bash
    npm install
    # or yarn install
    ```

    This command also runs the `prepare` script, which will download and set up the necessary Playwright browser binaries for end-to-end testing.

3.  **Configure Environment:**

    - Copy `.env.example` to `.env.local`: `cp .env.example .env.local`
    - Edit `.env.local` and fill in **all required** API keys and OAuth credentials:
      - `OPENAI_API_KEY` (required if using OpenAI)
      - `GOOGLE_AI_API_KEY` (required if using Google AI)
      - `GITHUB_ID`, `GITHUB_SECRET` (optional, if enabling GitHub login)
      - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional, if enabling Google login)
      - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (optional, if enabling Discord login)
      - `AUTH_SECRET`: Generate with `openssl rand -base64 32` (required if using Auth)
      - `NEXTAUTH_URL=http://localhost:3000` (for local dev with Auth)
      - `ADMIN_EMAILS`: Comma-separated list of emails for admin access (e.g., `admin@example.com,test@test.com`). _(Optional)_
      - `ACTIVE_MODEL`: (Optional) Set to a valid model name configured in `lib/modelConfig.ts` (e.g., `gpt-3.5-turbo`, `gemini-pro`). Defaults likely specified in `lib/modelConfig.ts`.
    - Ensure at least one AI provider is configured.

4.  **Run Dev Server:**

    ```bash
    npm run dev
    ```

    _(Uses Turbopack by default)_

5.  **Open App:** [http://localhost:3000](http://localhost:3000)

### Deploying to Fly.io (Optional)

Continuous Deployment is set up via GitHub Actions (`.github/workflows/fly.yml`). Pushing to `main` triggers deployment.

**First-Time Fly.io Setup:**

1.  **Login:** `fly auth login`
2.  **Create App:** `fly apps create <your-app-name>` (Use a unique name)
3.  **Create Volume:** `fly volumes create sqlite_data --app <your-app-name> --region <your-region> --size 1` (Adjust size if needed for game saves)
4.  **Set Production Secrets:**
    - **Crucial:** Edit `.env.local`, change `NEXTAUTH_URL` to `https://<your-app-name>.fly.dev` if using Auth. Ensure all other keys/secrets are for production.
    - Import secrets: `fly secrets import --app <your-app-name> < .env.local`
    - Verify/set individual secrets if needed: `fly secrets set KEY=VALUE --app <your-app-name>`
    - **Ensure `ADMIN_EMAILS` is set for production admin access if using the admin panel.**
5.  **Get Fly Token:** `fly auth token` (Copy the token)
6.  **Add GitHub Secret:**
    - Repo > Settings > Secrets and variables > Actions > "New repository secret".
    - Name: `FLY_API_TOKEN`
    - Value: Paste the token.

**Deployment:**

- Push to `main`: `git push origin main`
- Monitor in GitHub Actions tab.

**Manual Deployment:**

```bash
fly deploy --app <your-app-name>
```

### Switching AI Models

- **Locally:** Change `ACTIVE_MODEL` in `.env.local`.
- **Production (Fly.io):** Update the secret:
  ```bash
  fly secrets set ACTIVE_MODEL=<model_name> --app <your-app-name>
  # e.g., model_name = gpt-4-turbo or gemini-1.5-pro-latest (verify valid names)
  fly apps restart <your-app-name>
  ```

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
  - **Pre-push**: Runs `npm run verify` (full format check, lint, build checks). _(Verify exact hook configuration in `.husky/`)_

## Production Considerations

- **AI Costs**: Monitor AI provider dashboards closely for usage and costs, as adventure games can be interaction-heavy.
- **Rate Limits**: Adjust limits based on expected traffic, budget, and AI response times.
- **Security**: Review input handling, especially if user input influences AI prompts. Consider authentication/authorization for saving progress.
- **Scalability**: Adjust Fly.io machine specs/count in `fly.toml`. Database performance might become a factor if storing large amounts of game state history.
- **Database Backups**: Implement a backup strategy for the SQLite volume on Fly.io (e.g., using `litestream` or manual snapshots), especially if storing user progress.
- **Sentry**: Configure DSN in environment variables for production error tracking.
- **Prompt Engineering**: Continuously refine prompts in `app/actions/adventure.ts` for better narrative quality, consistency, and JSON adherence.

## Customization

- **Dungeon Layout**: Modify the `dungeonLayout` object in `app/actions/adventure.ts` to change rooms, descriptions, and connections.
- **AI Prompts**: Adjust prompts within `buildAdventurePrompt` in `app/actions/adventure.ts` to change the game's tone, AI behavior, combat difficulty, etc.
- **Game Mechanics**: Modify health values, add new enemies, items, or actions within `app/actions/adventure.ts` and related state management (`app/store/`).
- **Styling**: Modify Tailwind classes in components (`app/components`).
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

- View data from `users`, `rate_limits`, potentially game state or feedback tables. _(Verify available tables)_
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
2.  **Run App:** Start the development server: `npm run dev`.
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

_(Review `lib/db.ts` or schema definition files for the current schema. The schema below is from the PREVIOUS version and needs verification/updating.)_

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
  UNIQUE(provider_id, provider)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip_address TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Example: Potential table for saved games
CREATE TABLE IF NOT EXISTS saved_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_state TEXT NOT NULL, -- JSON blob of StoryContext?
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  save_name TEXT
);

-- Indexes (Review existing indexes)
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
CREATE INDEX IF NOT EXISTS idx_saved_games_user_id ON saved_games(user_id);
```

## Troubleshooting

- **Database Connection:** Ensure `data/` dir exists locally. On Fly, check volume mount (`fly.toml`) and status (`fly status`). Verify schema matches code.
- **Auth Errors:** Verify `.env.local` / Fly secrets (`AUTH_SECRET`, provider IDs/secrets, `NEXTAUTH_URL`). Ensure OAuth callback URLs match.
- **API Key Errors:** Check AI provider keys in env/secrets. Ensure billing/quotas are sufficient. Check `lib/modelConfig.ts`.
- **AI Errors:** Check Sentry/console logs for errors from the AI API. Ensure the AI is returning valid JSON matching the expected Zod schema in `app/actions/adventure.ts`. Refine prompts if needed.
- **Rate Limit Errors:** Wait for the window to reset or adjust limits if necessary. Check `rate_limits` table.
- **Admin Access Denied:** Confirm logged-in user's email is EXACTLY in `ADMIN_EMAILS`. Check Fly secrets value.
- **Deployment Issues:** Examine GitHub Actions logs and `fly logs --app <your-app-name>`.
- **State Management Issues:** Use React DevTools/Zustand DevTools to inspect game state.

## License

MIT License. See [LICENSE](LICENSE) file.
