async page => {
  const context = await page.context().browser().newContext();
  const app = await context.newPage();
  try {
    await app.goto("http://localhost:8786/#inventory");
    await app.evaluate(() => sessionStorage.setItem("POCKETDATA_AUTH_SESSION", JSON.stringify({accessToken: "phweb_pocketdata_browser_fixture", expiresAt: Date.now() + 3600000})));
    await app.reload();
    await app.getByRole("combobox", {name: "Selected SUT", exact: true}).selectOption("qa-ui");
    await app.getByRole("button", {name: "Download", exact: true}).waitFor();
    const catalogue = await (await app.request.get("http://localhost:8786/api/catalog")).json();
    const datasets = await (await app.request.get("http://localhost:8786/api/suts/qa-ui/datasets")).json();
    if (catalogue.suts[0].id !== "qa-ui" || datasets[0].counts.ready !== 1) throw new Error("Restart lost synthetic catalogue/DataSet state");
    return {afterProcessRestart: true, catalogue: true, csvInventory: true, redisStillOneRecord: true};
  } finally { await context.close(); }
}
