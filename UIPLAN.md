# OpenCodeHub — Self-Hosted GitHub UI Overhaul Plan (`UIPLAN.md`)

> **Objective**: Completely refactor and elevate OpenCodeHub into an authentic, pixel-perfect self-hosted GitHub platform inspired by the minimalist, high-contrast, black-and-white monochrome aesthetic of [Ryoku](https://ryoku.dev/) and the exact GitHub profile layout provided in the reference screenshot.

---

## 1. System Vision & Landing Page Paradigm

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       GLOBAL HEADER & SERVER NAVIGATION                     │
│  [Logo] [User/Org Switcher]   [Search: Type / to search]   [+] [PRs] [🔔] [Avatar]│
├─────────────────────────────────────────────────────────────────────────────┤
│  [Overview]  [Repositories 87]  [Projects]  [Packages]  [Stars 50]         │
├───────────────────────────────┬─────────────────────────────────────────────┤
│   LEFT SIDEBAR (PROFILE)      │   RIGHT MAIN CONTENT COLUMN                 │
│                               │                                             │
│  ┌─────────────────────────┐  │  ┌───────────────────────────────────────┐  │
│  │   Big Avatar (Circle)   │  │  │ swadhinbiswas / readme.md             │  │
│  │   + Status Badge (💭)   │  │  │                                       │  │
│  └─────────────────────────┘  │  │   [Rich Rendered Markdown Profile]    │  │
│  Name: Swadhin Biswas         │  │   - Role badges                       │  │
│  User: swadhinbiswas · he/him │  │   - Project showcase table            │  │
│  [Follow/Edit]  [💖 Sponsor]   │  │   - Social contact pills              │  │
│  Bio: MLOps & Data Engineer.. │  └───────────────────────────────────────┘  │
│  👥 94 followers · 116 following│                                             │
│                               │  ┌───────────────────────────────────────┐  │
│  🏢 @TheOpenCodeHub           │  │ Pinned Repositories (2-Column Grid)   │  │
│  📍 Dhaka, Bangladesh         │  │ ┌─────────────────┐ ┌───────────────┐ │  │
│  🕒 16:55 (Local Time)        │  │ │ opengrammar     │ │ FAANG-Playbook│ │  │
│  ✉️ swadhinbiswas.cse@gmail.com│  │ │ TypeScript ★115│ │ Astro ★36    │ │  │
│  🔗 https://swadhin.cv        │  │ └─────────────────┘ └───────────────┘ │  │
│  Socials: X, LinkedIn, HF...  │  └───────────────────────────────────────┘  │
│                               │                                             │
│  🏆 Achievements Badges       │  ┌───────────────────────────────────────┐  │
│  ⭐ Highlights (PRO)          │  │ 365-Day Contribution Calendar Heatmap │  │
│  🏛️ Organizations Grid        │  │ 6,870 contributions in 2026           │  │
│                               │  │ [52 Weeks x 7 Days Grid] [Years Tabs] │  │
│  [Block or report user]       │  └───────────────────────────────────────┘  │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

### 1.1 Self-Hosted Landing Page Philosophy
On a self-hosted Git platform, visitors and users should not see a generic SaaS marketing page. Instead:
1. **Root URL (`/`)**: Directly renders the **Primary Server User Profile** (or primary organization / logged-in user dashboard), complete with:
   - Profile Header & Tabs (`Overview`, `Repositories`, `Projects`, `Packages`, `Stars`)
   - Left Profile Dossier (Avatar, bio, followers, metadata, achievements, orgs)
   - Profile README (`{username}/README.md` from `{username}/{username}` repo)
   - Pinned Repositories grid
   - 365-Day Contribution Heatmap & activity timeline
   - **Server User & Organization Directory Bar**: Quick discovery and switcher for all users and organizations hosted on this server instance.
2. **User Profile URL (`/[owner]`)**: Renders the exact same GitHub-authentic profile for any user or organization on the server.
3. **Repository Workspace (`/[owner]/[repo]`)**: Clean GitHub-style sub-nav (`Code`, `Issues`, `Pull Requests`, `Actions`, `Merge Queue`, `Wiki`, `Security`, `Settings`) with Ryoku-styled monochrome file browser, commit history, and Markdown view.

---

## 2. Design Tokens & Visual Hierarchy (Ryoku Monochrome)

### 2.1 CSS Color Tokens (`src/styles/globals.css`)
```css
/* Ryoku High-Contrast Monochrome */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 9%;
  --card: 0 0% 98%;
  --card-foreground: 0 0% 9%;
  --border: 0 0% 89%;
  --input: 0 0% 89%;
  --ring: 0 0% 9%;
  --radius: 0.375rem;
}

.dark {
  --background: 0 0% 3.5%;        /* #09090b - Obsidian void */
  --foreground: 0 0% 98%;         /* #fafafa - Crisp white text */
  --card: 0 0% 5.5%;              /* #0e0e11 - Elevated container */
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 5.5%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;            /* Pure white primary button/accent */
  --primary-foreground: 0 0% 9%;  /* Dark text on white */
  --secondary: 0 0% 10%;          /* #1a1a1e - Subtle background */
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 10%;
  --muted-foreground: 0 0% 60%;   /* #999999 - Subdued metadata */
  --accent: 0 0% 12%;
  --accent-foreground: 0 0% 98%;
  --border: 0 0% 14%;             /* 1px precision hairline border */
  --input: 0 0% 14%;
  --ring: 0 0% 98%;
  --radius: 0.375rem;
}
```

---

## 3. Component Architecture & Modular Breakdown

### 3.1 Global Header (`src/components/layout/Header.astro`)
- Sleek sticky glass navbar (`backdrop-blur-md bg-background/90 border-b border-border`).
- Left: GitHub / OpenCodeHub mark + Server instance badge (`Self-Hosted`) + Quick User/Org switcher dropdown.
- Center/Right: Search bar (`Type / to search` with `⌘K` trigger), `+` create dropdown (New repo, new org), Issues icon, Pull Requests icon, Notifications inbox icon with unread badge, and User Avatar menu.

### 3.2 User Profile Component (`src/components/profile/UserProfileView.astro`)
A unified, highly reusable component powering both `/` (landing page) and `/[owner]` (profile page):

1. **Sub-Navigation Tabs**:
   - `Overview` (active indicator)
   - `Repositories` (with live count badge)
   - `Projects`
   - `Packages`
   - `Stars` (with live star count badge)
2. **Left Profile Sidebar (Dossier)**:
   - **Avatar Frame**: `296x296px` round avatar with status indicator badge (`💭`).
   - **Identity**: Large display name (`text-2xl font-bold`), username (`text-xl text-muted-foreground font-light`), pronouns (`he/him`).
   - **Actions**: `Edit profile` (if logged in owner) or dual buttons `Follow` / `Unfollow` + `💖 Sponsor`.
   - **Bio**: Full markdown/text bio with auto-linking.
   - **Follower Counter**: `👥 94 followers · 116 following`.
   - **Metadata Details**:
     - Organization / Company link (`@TheOpenCodeHub`)
     - Location pin (`Dhaka, Bangladesh`)
     - Local time calculator based on timezone / offset
     - Verified email mailto link
     - Portfolio / Website URL
     - Social links list (X / Twitter, LinkedIn, Hugging Face, ORCID, GitHub)
   - **Achievements Shelf**: Interactive badges (`Pull Shark`, `Quickdraw`, `YOLO`, `Galaxy Brain`, `Starstruck`).
   - **Highlights Shelf**: `PRO` member badge.
   - **Organizations Shelf**: Grid of organization avatar icons with tooltips.
   - **Footer Action**: "Block or report user".

3. **Right Main Column**:
   - **Profile README (`{username} / readme.md`)**:
     - Header ribbon with file icon and repository source link.
     - Rich GitHub-flavored markdown renderer with HTML tables, badge shields, social contact buttons, images, and code blocks.
   - **Pinned Repositories (2-Column Grid)**:
     - Header: `Pinned` + "Customize your pins" link for owner.
     - Pinned cards: Repo icon, Name, `Public` badge pill, Description, Language color indicator, Star count, Fork count.
   - **365-Day Contribution Calendar Heatmap**:
     - Annual contributions summary banner (`6,870 contributions in 2026`).
     - 52-week x 7-day grid with month headers, day labels, high-contrast monochrome/emerald cells, and hover tooltip.
     - Multi-year switcher tabs on the right (`2026`, `2025`, `2024`, etc.).
     - Contribution activity timeline below the calendar.

---

## 4. Implementation Steps

| Step | Action Item | Target Files |
| :--- | :--- | :--- |
| **1. Theming & Tokens** | Update global CSS variables for Ryoku monochrome aesthetic | `src/styles/globals.css`, `tailwind.config.mjs` |
| **2. Core Profile Components** | Create dedicated GitHub profile components | `src/components/profile/UserProfileView.astro`<br/>`src/components/profile/ProfileReadme.astro`<br/>`src/components/profile/PinnedRepos.astro`<br/>`src/components/profile/ContributionCalendar.astro` |
| **3. Landing Page Transformation** | Wire root `/` to display the primary server user profile with instance switcher | `src/pages/index.astro` |
| **4. User Profile Page Polish** | Wire `/[owner]/index.astro` to use the unified `UserProfileView` | `src/pages/[owner]/index.astro` |
| **5. Header & Shell Refactor** | Update top navbar with GitHub layout, search, and user dropdown | `src/components/layout/Header.astro`, `src/layouts/BaseLayout.astro` |
| **6. Verification & Test Suite** | Run typecheck, unit tests, and layout responsiveness checks | `npm run typecheck`, `npm test` |

---

*Plan updated and ready to execute.*
