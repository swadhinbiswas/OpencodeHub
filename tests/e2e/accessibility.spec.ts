/**
 * Accessibility E2E Tests — WCAG 2.1 AA compliance
 *
 * Uses @axe-core/playwright to automatically detect accessibility violations
 * across key pages. Covers:
 * - WCAG 2.4.1: Skip navigation / bypass blocks
 * - WCAG 1.1.1: Non-text content (alt text, aria-labels)
 * - WCAG 1.3.1: Info and relationships (semantic HTML, ARIA roles)
 * - WCAG 1.4.3: Contrast (minimum 4.5:1)
 * - WCAG 2.1.1: Keyboard navigable
 * - WCAG 4.1.2: Name, role, value (ARIA attributes)
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

interface AxeViolation {
  id: string;
  impact?: string;
  description: string;
  nodes: unknown[];
}

// Pages to test for accessibility
const PUBLIC_PAGES = [
  { name: "Home", path: "/" },
  { name: "Explore", path: "/explore" },
  { name: "Login", path: "/login" },
  { name: "Register", path: "/register" },
  { name: "Documentation", path: "/docs/" },
];

/**
 * Run axe-core on a page and return the results.
 * Tags filter ensures we check WCAG 2.1 AA rules.
 */
async function runAxe(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".toaster") // Exclude transient toast notifications
    .analyze();
}

test.describe("Accessibility — WCAG 2.1 AA compliance", () => {
  for (const { name, path } of PUBLIC_PAGES) {
    test(`${name} page (${path}) has no critical accessibility violations`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: "networkidle" });

      const results = await runAxe(page);

      // Filter to critical and serious violations only
      const critical = (results.violations as AxeViolation[]).filter(
        (v: AxeViolation) => v.impact === "critical" || v.impact === "serious",
      );

      if (critical.length > 0) {
        const summary = critical
          .map(
            (v: AxeViolation) =>
              `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} occurrences)`,
          )
          .join("\n");
        console.error(`Accessibility violations on ${name}:\n${summary}`);
      }

      expect(
        critical,
        `Expected no critical/serious a11y violations on ${name}`,
      ).toHaveLength(0);
    });
  }

  test("Skip-to-content link is present and functional", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // The skip link should exist
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Should be visually hidden by default
    const box = await skipLink.boundingBox();
    // sr-only makes it 1x1px or off-screen — either way not visible
    expect(box === null || box.width <= 1 || box.height <= 1).toBeTruthy();

    // Focus the skip link and verify it becomes visible
    await skipLink.focus();
    await expect(skipLink).toBeFocused();

    // After focus, the sr-only class should be overridden by focus:not-sr-only
    const focusedBox = await skipLink.boundingBox();
    expect(focusedBox).not.toBeNull();
    if (focusedBox) {
      expect(focusedBox.width).toBeGreaterThan(10);
      expect(focusedBox.height).toBeGreaterThan(10);
    }

    // Main content target should exist
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeAttached();
    await expect(mainContent).toHaveAttribute("role", "main");
  });

  test("Header has proper ARIA landmarks and roles", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Banner role on header
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeAttached();

    // Main navigation
    const mainNav = page.locator('nav[aria-label="Main navigation"]');
    await expect(mainNav).toBeAttached();

    // Logo has accessible label
    const logoLink = page.locator('a[aria-label="OpenCodeHub home"]');
    await expect(logoLink).toBeAttached();

    // Search region
    const searchRegion = page.locator('[role="search"]');
    await expect(searchRegion).toBeAttached();
  });

  test("Footer has proper semantic structure", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Footer with contentinfo role
    const footer = page.locator('footer[role="contentinfo"]');
    await expect(footer).toBeAttached();

    // Footer navigation
    const footerNav = page.locator('nav[aria-label="Footer navigation"]');
    await expect(footerNav).toBeAttached();

    // External link has proper labeling
    const githubLink = page.locator(
      'a[aria-label="GitHub repository (opens in new tab)"]',
    );
    await expect(githubLink).toBeAttached();
    await expect(githubLink).toHaveAttribute("target", "_blank");
    await expect(githubLink).toHaveAttribute("rel", /noopener/);
  });

  test("Dropdown menus have proper ARIA attributes", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Create menu button
    const createBtn = page.locator('#create-menu button[aria-haspopup="true"]');
    // May not be visible if user not logged in — check if present
    const createBtnCount = await createBtn.count();

    if (createBtnCount > 0) {
      await expect(createBtn).toHaveAttribute("aria-expanded", "false");
      await expect(createBtn).toHaveAttribute(
        "aria-controls",
        "create-dropdown",
      );

      // The dropdown should have role="menu"
      const createDropdown = page.locator('#create-dropdown[role="menu"]');
      await expect(createDropdown).toBeAttached();

      // Menu items should have role="menuitem"
      const menuItems = createDropdown.locator('[role="menuitem"]');
      expect(await menuItems.count()).toBeGreaterThan(0);
    }
  });

  test("Mobile menu button has proper ARIA attributes", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "networkidle" });

    const mobileBtn = page.locator("#mobile-menu-btn");
    await expect(mobileBtn).toBeVisible();
    await expect(mobileBtn).toHaveAttribute("aria-label", "Menu");
    await expect(mobileBtn).toHaveAttribute("aria-expanded", "false");

    // Click to open
    await mobileBtn.click();
    await expect(mobileBtn).toHaveAttribute("aria-expanded", "true");

    // Mobile nav should be visible
    const mobileNav = page.locator("#mobile-nav");
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav).toHaveAttribute("role", "dialog");
  });

  test("Keyboard navigation: Escape closes open dropdowns", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Mobile viewport to test mobile menu
    await page.setViewportSize({ width: 375, height: 812 });

    const mobileBtn = page.locator("#mobile-menu-btn");
    await mobileBtn.click();

    const mobileNav = page.locator("#mobile-nav");
    await expect(mobileNav).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");
    await expect(mobileNav).not.toBeVisible();
    await expect(mobileBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("All images have alt text", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");
      const src = await img.getAttribute("src");
      expect(
        alt !== null && alt !== undefined,
        `Image ${src} is missing alt attribute`,
      ).toBeTruthy();
    }
  });

  test("Interactive elements are keyboard focusable", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Tab through the page and ensure we can reach key elements
    await page.keyboard.press("Tab");
    // First tab should hit the skip-to-content link
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();

    // Continue tabbing — should reach the logo
    await page.keyboard.press("Tab");
    const logo = page.locator('a[aria-label="OpenCodeHub home"]');
    await expect(logo).toBeFocused();
  });

  test("Page has exactly one main landmark", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const mainElements = page.locator("main, [role='main']");
    // Should have exactly 1 main landmark (our <main id="main-content" role="main">)
    const count = await mainElements.count();
    // It's the same element, so count should be 1
    expect(count).toBe(1);
  });

  test("HTML lang attribute is set", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("en");
  });
});
