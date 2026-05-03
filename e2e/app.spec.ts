import { test, expect, Page } from "@playwright/test";
import { MOCK_MOVIES, MOCK_SETTINGS, MOCK_RECS } from "./fixtures";

async function mockAPIs(page: Page) {
  await page.route("/api/movies", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: MOCK_MOVIES });
    } else {
      route.continue();
    }
  });
  await page.route("/api/settings", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: MOCK_SETTINGS });
    } else {
      route.continue();
    }
  });
  await page.route("/api/recommendations/count", (route) =>
    route.fulfill({ json: { total: 12 } })
  );
  await page.route("/api/recommendations/mood*", (route) =>
    route.fulfill({
      json: [
        {
          reason: "High-energy action for tonight",
          type: "mood",
          recommendations: [
            {
              tmdb_id: 603,
              title: "The Matrix",
              year: 1999,
              genre: "Action, Science Fiction",
              rating: 8.7,
              poster_url: null,
            },
          ],
        },
      ],
    })
  );
  await page.route("/api/recommendations*", (route) =>
    route.fulfill({ json: MOCK_RECS })
  );
}

async function goToLibrary(page: Page) {
  // Click Library tab and wait for movie cards to appear
  // Longer timeout to handle initial Next.js dev compilation
  await page.getByRole("button", { name: /^Library/ }).click();
  await expect(page.getByText("The Godfather")).toBeVisible({ timeout: 20_000 });
}

test.describe("page load", () => {
  test("shows FilmPick title and tabs", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /FilmPick/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Discover/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Library/ })).toBeVisible();
    // Use first() since "From Watchlist" rec category also matches /Watchlist/
    await expect(page.getByRole("button", { name: /^Watchlist/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Config/ })).toBeVisible();
  });

  test("Discover tab is active by default", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    const discoverBtn = page.getByRole("button", { name: /Discover/i });
    await expect(discoverBtn).toHaveClass(/text-white/);
  });

  test("shows search input after movies load", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
  });
});

test.describe("tab navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    // Wait for movies to load (needed for library/watchlist counts to appear)
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
  });

  test("switches to Library tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Library/ }).click();
    await expect(page).toHaveURL(/#library/);
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({ timeout: 8_000 });
  });

  test("switches to Watchlist tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page).toHaveURL(/#wishlist/);
  });

  test("switches to Config tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Config/ }).click();
    await expect(page).toHaveURL(/#config/);
  });

  test("switches back to Discover tab", async ({ page }) => {
    await page.getByRole("button", { name: /^Library/ }).click();
    await page.getByRole("button", { name: /^Discover/ }).click();
    await expect(page).toHaveURL(/#recommendations/);
  });

  test("restores Library tab from hash on load", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#library");
    await expect(page).toHaveURL(/#library/);
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible({
      timeout: 8_000,
    });
  });
});

test.describe("library tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await goToLibrary(page);
  });

  test("renders movie cards for each movie", async ({ page }) => {
    await expect(page.getByText("The Godfather")).toBeVisible();
    await expect(page.getByText("Blade Runner 2049")).toBeVisible();
  });

  test("shows user rating badge on rated movie", async ({ page }) => {
    await expect(page.getByText("♥ 10/10").first()).toBeVisible();
    await expect(page.getByText("♥ 8/10").first()).toBeVisible();
  });

  test("shows sort/filter bar with sort options", async ({ page }) => {
    // SortFilterBar renders a select with sort options
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("shows movie count", async ({ page }) => {
    await expect(page.getByText(/Showing 2 of 2/)).toBeVisible();
  });
});

test.describe("library search filter", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await goToLibrary(page);
  });

  test("filters movies by title as user types", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");

    await expect(page.getByText("The Godfather")).toBeVisible();
    await expect(page.getByText("Blade Runner 2049")).not.toBeVisible();
  });

  test("clears filter with ESC", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(page.getByText("Blade Runner 2049")).not.toBeVisible();

    await searchInput.press("Escape");
    await expect(page.getByText("Blade Runner 2049")).toBeVisible();
  });

  test("shows movie count with filter active", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search library...");
    await searchInput.fill("godfather");
    await expect(page.getByText(/Showing 1 of 1/)).toBeVisible();
  });
});

test.describe("movie detail", () => {
  test("opens movie detail on card click", async ({ page }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      })
    );
    await page.goto("/");
    await goToLibrary(page);

    // Click movie card — MovieDetail is rendered as a fixed overlay div
    await page.getByText("The Godfather").first().click();
    // The overlay contains a close button and movie title
    await expect(page.locator(".fixed.inset-0").getByText("The Godfather").first()).toBeVisible({ timeout: 8_000 });
  });

  test("closes movie detail with close button", async ({ page }) => {
    await mockAPIs(page);
    await page.route("/api/movies/1/full", (route) =>
      route.fulfill({
        json: {
          movie: { ...MOCK_MOVIES[0] },
          cast: [],
          crew: [],
          similar: [],
        },
      })
    );
    await page.goto("/");
    await goToLibrary(page);

    await page.getByText("The Godfather").first().click();
    const overlay = page.locator(".fixed.inset-0");
    await expect(overlay).toBeVisible({ timeout: 8_000 });

    // Close button has title="Close" but text content "✕"
    await overlay.locator('[title="Close"]').click();
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe("discover / recommendations tab", () => {
  test("shows recommendation cards after load", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByText("GoodFellas")).toBeVisible({ timeout: 10_000 });
  });

  test("shows a readable empty state for invalid mood routes", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#recommendations/mood/not-a-real-preset");
    await expect(page.getByText("Unknown mood preset")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(
        `"not-a-real-preset" isn't available in this build. Choose one from the Mood menu.`
      )
    ).toBeVisible();
  });

  test("restores a valid mood route from the hash", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#recommendations/mood/action_evening");
    await expect(page.getByRole("button", { name: /Action Evening/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("The Matrix")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Unknown mood preset")).not.toBeVisible();
  });

  test("shows empty state when no movies", async ({ page }) => {
    await page.route("/api/movies", (route) => route.fulfill({ json: [] }));
    await page.route("/api/settings", (route) => route.fulfill({ json: MOCK_SETTINGS }));
    await page.route("/api/recommendations/count", (route) =>
      route.fulfill({ json: { total: 0 } })
    );
    await page.goto("/");
    await expect(page.getByText("No recommendations yet")).toBeVisible();
  });

  test("category filter tabs are visible", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    // Wait for movies to load first (needed for rec dropdowns to appear)
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
    // Engine dropdown trigger shows "All" (default category), Mood dropdown trigger shows "Mood"
    await expect(page.getByRole("button", { name: /^All/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mood/ })).toBeVisible();
  });

  test("switching category tab updates URL hash", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Search library...")).toBeVisible();
    // Open the engine dropdown, then pick "By Genre" from inside it
    await page.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("button", { name: "By Genre" }).click();
    await expect(page).toHaveURL(/#recommendations\/genre/);
  });
});

test.describe("config tab", () => {
  test("renders config panel with TMDb key status", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/#config");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/TMDb/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("keeps the active app tab visible on mobile hash loads", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#config");
    await page.waitForLoadState("networkidle");

    const activeTab = page.getByRole("button", { name: /^Config/ });
    await expect(activeTab).toBeVisible();
    const box = await activeTab.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("tv tab", () => {
  test("keeps the active TV tab visible on mobile hash loads", async ({
    page,
  }) => {
    await mockAPIs(page);
    await page.route("/api/tv", (route) =>
      route.fulfill({
        json: {
          channels: [],
          programs: [],
          cachedAt: new Date().toISOString(),
          epgUrl: "",
          cached: true,
        },
      }),
    );
    await page.route("/api/tv/blacklist", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("/api/tv/enrich", (route) => route.fulfill({ json: {} }));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#tv");
    await page.waitForLoadState("networkidle");

    const activeTab = page.getByRole("button", { name: /^TV$/ });
    await expect(activeTab).toBeVisible();
    const box = await activeTab.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("watchlist tab", () => {
  test("shows empty state when watchlist is empty", async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page.getByText("Your watchlist is empty")).toBeVisible({ timeout: 8_000 });
  });

  test("shows watchlist movies", async ({ page }) => {
    const wishlistMovie = { ...MOCK_MOVIES[0], id: 99, wishlist: 1, user_rating: null };
    await page.route("/api/movies", (route) =>
      route.fulfill({ json: [wishlistMovie] })
    );
    await page.route("/api/settings", (route) => route.fulfill({ json: MOCK_SETTINGS }));
    await page.route("/api/recommendations/count", (route) =>
      route.fulfill({ json: { total: 0 } })
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Watchlist/ }).first().click();
    await expect(page.getByText("The Godfather")).toBeVisible({ timeout: 8_000 });
  });
});
