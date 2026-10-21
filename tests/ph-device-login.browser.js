async (page, appOrigin = "http://localhost:8785") => {
  if (!/^http:\/\/localhost:\d+$/.test(appOrigin)) throw new Error("Use an explicit local PocketData origin");
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const browser = page.context().browser();
  const adminContext = await browser.newContext({viewport: {width: 1366, height: 768}});
  const viewerContext = await browser.newContext({viewport: {width: 1000, height: 768}});
  const errors = [];
  async function login(app, username) {
    const opened = app.waitForEvent("popup");
    await app.locator("#auth-button").click();
    const confirmation = await opened;
    const confirm = confirmation.getByRole("button", {name: "Confirm sign in", exact: true});
    const complete = confirmation.getByRole("heading", {name: "Confirmation complete", exact: true});
    await confirmation.locator("#username").or(confirm).or(complete).waitFor();
    if (await confirmation.locator("#username").isVisible()) {
      await confirmation.locator("#username").fill(username);
      await confirmation.getByRole("button", {name: "Sign in", exact: true}).click();
    }
    await confirm.or(complete).waitFor();
    if (await confirm.isVisible()) await confirm.click();
    await complete.waitFor();
    await app.locator("#auth-button").filter({hasText: username + " · Sign out"}).waitFor({timeout: 15000});
    ensure(app.url() === appOrigin + "/#suts", "Original app destination changed");
    await confirmation.close();
  }
  try {
    const admin = await adminContext.newPage();
    admin.on("pageerror", error => errors.push(error.message));
    await admin.goto(appOrigin + "/#suts");
    await admin.locator("#auth-button").filter({hasText: "View only · Sign in"}).waitFor();
    ensure(!await admin.getByRole("button", {name: "＋ SUT", exact: true}).isVisible(), "Anonymous edit controls exposed");
    await login(admin, "local-admin");
    ensure(await admin.getByRole("button", {name: "＋ SUT", exact: true}).isVisible(), "Admin edit controls missing");
    await admin.reload();
    await admin.locator("#auth-button").filter({hasText: "local-admin · Sign out"}).waitFor();
    const token = await admin.evaluate(() => JSON.parse(sessionStorage.getItem("POCKETDATA_AUTH_SESSION")).accessToken);
    ensure(token.startsWith("phweb_"), "No PH browser token");
    const rail = admin.getByRole("button", {name: "Expand view sidebar", exact: true});
    if (await rail.isVisible()) await rail.click();
    await admin.getByRole("button", {name: "Collapse view sidebar", exact: true}).waitFor();
    await admin.reload();
    await admin.getByRole("button", {name: "Collapse view sidebar", exact: true}).waitFor();

    const secondOrigin = await adminContext.newPage();
    await secondOrigin.goto(appOrigin + "/#suts");
    await secondOrigin.locator("#auth-button").filter({hasText: "View only · Sign in"}).waitFor();
    const opened = secondOrigin.waitForEvent("popup");
    await secondOrigin.locator("#auth-button").click();
    const confirmation = await opened;
    await confirmation.waitForURL("http://localhost:8089/auth-service/**");
    const confirm = confirmation.getByRole("button", {name: "Confirm sign in", exact: true});
    const complete = confirmation.getByRole("heading", {name: "Confirmation complete", exact: true});
    await confirm.or(complete).waitFor();
    ensure(!confirmation.url().includes("/oauth/dev/login"), "Shared PH session was not reused");
    if (await confirm.isVisible()) await confirm.click();
    await secondOrigin.locator("#auth-button").filter({hasText: "local-admin · Sign out"}).waitFor({timeout: 15000});
    const secondToken = await secondOrigin.evaluate(() => JSON.parse(sessionStorage.getItem("POCKETDATA_AUTH_SESSION")).accessToken);
    ensure(secondToken !== token, "Independent sign-in reused a token");
    await confirmation.close();

    const viewer = await viewerContext.newPage();
    await viewer.goto(appOrigin + "/#suts");
    await viewer.locator("#auth-button").filter({hasText: "View only · Sign in"}).waitFor();
    await login(viewer, "local-viewer");
    ensure(!await viewer.getByRole("button", {name: "＋ SUT", exact: true}).isVisible(), "Viewer edit controls exposed");
    const viewerStatus = await viewer.evaluate(async () => {
      const token = JSON.parse(sessionStorage.getItem("POCKETDATA_AUTH_SESSION")).accessToken;
      return (await fetch("/api/suts/auth-probe/datasets/no-data/inventory", {headers: {Authorization: "Bearer " + token}})).status;
    });
    ensure(viewerStatus === 403, "Viewer raw inventory read was not denied");

    const signedOut = admin.waitForEvent("popup");
    await admin.locator("#auth-button").click();
    const logout = await signedOut;
    await logout.waitForURL("http://localhost:8089/auth-service/oauth/device/logout?client_id=pocketdata-device");
    await logout.getByRole("button", {name: "Sign out of shared login", exact: true}).click();
    await admin.locator("#auth-button").filter({hasText: "View only · Sign in"}).waitFor();
    const revoked = await admin.request.get(appOrigin + "/api/session", {headers: {Authorization: "Bearer " + token}});
    ensure(revoked.status() === 401, "Signed-out token is still valid");
    const layout = await admin.evaluate(() => ({
      headers: document.querySelectorAll("header").length,
      mains: document.querySelectorAll("main").length,
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      callback: location.pathname.includes("callback")
    }));
    ensure(layout.headers === 1 && layout.mains === 1 && !layout.overflow && !layout.callback, "Invalid shared shell layout/callback routing");
    ensure(errors.length === 0, "Browser errors: " + errors.join("; "));
    return {appOrigin, admin: true, viewerDenied: true, sessionRestored: true, independentTokens: true, centralSessionReused: true,
      logoutRevoked: true, layout, operationalMutations: false, desktopForwardingVerified: false};
  } finally { await adminContext.close(); await viewerContext.close(); }
}
