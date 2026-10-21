async page => {
  const context = await page.context().browser().newContext({viewport: {width: 1366, height: 768}});
  const app = await context.newPage();
  const errors = [];
  app.on("pageerror", failure => errors.push(failure.message));
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const home = () => app.getByRole("link", {name: "PocketData home", exact: true}).click();
  const shortcuts = () => app.getByRole("navigation", {name: "Workspace shortcuts", exact: true});
  try {
    await app.goto("http://localhost:8785/");
    await app.getByRole("heading", {name: "PocketData", exact: true}).waitFor();
    const response = await app.request.get("http://localhost:8785/api/connections");
    const configuration = await response.json();
    const redis = app.getByRole("article", {name: "Redis", exact: true});
    const auth = app.getByRole("article", {name: "PocketHive Auth", exact: true});
    await redis.getByText(configuration.redisConfigured ? "Configured" : "Not configured", {exact: true}).waitFor();
    await auth.getByText(configuration.authConfigured ? "Configured" : "Not configured", {exact: true}).waitFor();
    ensure(await app.getByText(/not a live health check/).isVisible(), "Configuration was presented as live health");
    await app.getByRole("button", {name: "Expand view sidebar", exact: true}).click();
    ensure(await app.getByRole("link", {name: "Home", exact: true}).getAttribute("aria-current") === "page", "Home navigation is not active");

    const refreshed = app.waitForResponse(result => new URL(result.url()).pathname === "/api/connections");
    await app.getByRole("button", {name: "Refresh", exact: true}).click();
    ensure((await refreshed).ok(), "Connection refresh failed");
    await redis.getByText(configuration.redisConfigured ? "Configured" : "Not configured", {exact: true}).waitFor();
    await shortcuts().getByRole("link", {name: /^SUTs/}).click();
    await app.getByRole("heading", {name: "Systems under test", exact: true}).waitFor();
    ensure(await redis.count() === 0, "Connection cards are repeated on editing screens");
    ensure(await app.getByRole("link", {name: "Home", exact: true}).getAttribute("aria-current") === null, "Home stays active on another view");
    await home();
    await shortcuts().getByRole("link", {name: /^DataSets/}).click();
    await app.getByRole("heading", {name: "DataSets", exact: true}).waitFor();
    await home();
    await shortcuts().getByRole("link", {name: /^CSV inventory/}).click();
    await app.getByRole("heading", {name: "CSV inventory", exact: true}).waitFor();
    await home();
    await app.getByRole("button", {name: "Collapse view sidebar", exact: true}).click();
    await app.screenshot({path: "/tmp/pocketdata-home-desktop.png"});

    await app.setViewportSize({width: 390, height: 844});
    await app.screenshot({path: "/tmp/pocketdata-home-mobile.png"});
    await app.getByText(/not a live health check/).scrollIntoViewIfNeeded();
    await app.screenshot({path: "/tmp/pocketdata-home-mobile-connections.png"});
    const layout = await app.evaluate(() => ({
      headers: document.querySelectorAll("header").length,
      mains: document.querySelectorAll("main").length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      documentScroll: document.documentElement.scrollHeight > innerHeight,
    }));
    ensure(layout.headers === 1 && layout.mains === 1 && !layout.horizontalOverflow && !layout.documentScroll, "Landing breaks the bounded shared shell");
    ensure(errors.length === 0, "Browser errors: " + errors.join("; "));
    return {defaultHome: true, configurationCards: true, refresh: true, shortcuts: true, logoHome: true, contextualNavigation: true, layout, operationalMutations: false};
  } finally { await context.close(); }
}
