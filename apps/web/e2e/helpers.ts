import { expect, type Page } from '@playwright/test';

export async function setCode(page: Page, code: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  // insertText skips auto-indent, so pasted code keeps its exact layout.
  await page.keyboard.insertText(code);
}

export async function setInput(page: Page, input: string, expected = '') {
  await page.getByLabel('Input, one parameter per line').fill(input);
  await page.getByLabel('Expected output (optional)').fill(expected);
}

export async function runAndWait(page: Page) {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 45_000 });
}

export async function totalSteps(page: Page): Promise<number> {
  return Number(await page.getByLabel('Timeline').getAttribute('max')) + 1;
}

export async function goToStep(page: Page, step: number) {
  await page.getByLabel('Timeline').evaluate((el: HTMLInputElement, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, step);
}
