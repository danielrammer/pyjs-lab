async function expandLevels(page){
  await page.locator('.learn-level-heading button').first().waitFor();
  const buttons=await page.locator('.learn-level-heading button').all();
  for(const button of buttons)if(await button.getAttribute('aria-expanded')==='false')await button.click();
}
module.exports={expandLevels};
