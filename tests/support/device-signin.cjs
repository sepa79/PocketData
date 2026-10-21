const assert = require('node:assert/strict');

async function deviceSignIn(page, context, reuse) {
  const opened = context.waitForEvent('page');
  await page.getByRole('button', {name: 'View only · Sign in', exact: true}).click();
  const confirmation = await opened;
  const confirm = confirmation.getByRole('button', {name: 'Confirm sign in', exact: true});
  const complete = confirmation.getByRole('heading', {name: 'Confirmation complete', exact: true});
  await confirmation.locator('#username').or(confirm).or(complete).waitFor();
  if (await confirmation.locator('#username').isVisible()) {
    assert.equal(reuse, false, 'Central PH login was not reused');
    await confirmation.locator('#username').fill('local-admin');
    await confirmation.getByRole('button', {name: 'Sign in', exact: true}).click();
  }
  await confirm.or(complete).waitFor();
  if (await confirm.isVisible()) await confirm.click();
  await page.getByRole('button', {name: 'local-admin · Sign out', exact: true}).waitFor({timeout: 45000});
  await confirmation.close();
}

module.exports = {deviceSignIn};
