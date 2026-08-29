import { expect, test, type Page } from '@playwright/test';

async function colorChannels(page: Page, value: string): Promise<number[]> {
  return page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, value);
}

test('legal theme colors and dividers reach rendered styles', async ({ page }) => {
  await page.goto('/terms');

  const article = page.locator('.legal-content');
  await expect(article).toBeVisible();

  await article.evaluate(element => {
    const link = document.createElement('a');
    link.id = 'legal-style-probe';
    link.href = '#style-probe';
    link.textContent = 'Style probe';
    element.appendChild(link);
  });

  const link = page.locator('#legal-style-probe');

  for (const dark of [false, true]) {
    await page.evaluate(isDark => document.documentElement.classList.toggle('dark', isDark), dark);
    await page.mouse.move(0, 0);

    const styles = await article.evaluate(element => {
      const reference = document.createElement('span');
      reference.style.color = 'var(--foreground)';
      document.body.appendChild(reference);

      const borderReference = document.createElement('span');
      borderReference.style.color = 'var(--border)';
      document.body.appendChild(borderReference);

      const primaryReference = document.createElement('span');
      primaryReference.style.color = 'var(--primary)';
      document.body.appendChild(primaryReference);

      const articleStyle = getComputedStyle(element);
      const headingStyle = getComputedStyle(element.querySelector('h2')!);
      const linkStyle = getComputedStyle(element.querySelector('#legal-style-probe')!);
      const referenceStyle = getComputedStyle(reference);

      const result = {
        articleColor: articleStyle.color,
        headingColor: headingStyle.color,
        headingBorderColor: headingStyle.borderBottomColor,
        headingBorderStyle: headingStyle.borderBottomStyle,
        headingBorderWidth: headingStyle.borderBottomWidth,
        linkColor: linkStyle.color,
        foreground: referenceStyle.color,
        border: getComputedStyle(borderReference).color,
        primary: getComputedStyle(primaryReference).color,
      };

      reference.remove();
      borderReference.remove();
      primaryReference.remove();
      return result;
    });

    expect(await colorChannels(page, styles.articleColor)).toEqual(
      await colorChannels(page, styles.foreground)
    );
    expect(await colorChannels(page, styles.headingColor)).toEqual(
      await colorChannels(page, styles.foreground)
    );
    expect(await colorChannels(page, styles.headingBorderColor)).toEqual(
      await colorChannels(page, styles.border)
    );
    expect(styles.headingBorderStyle).toBe('solid');
    expect(styles.headingBorderWidth).toBe('1px');
    expect(await colorChannels(page, styles.linkColor)).toEqual(
      await colorChannels(page, styles.primary)
    );

    await link.hover();
    const hoverColors = await link.evaluate(element => {
      const reference = document.createElement('span');
      reference.style.color = 'color-mix(in srgb, var(--primary) 80%, transparent)';
      document.body.appendChild(reference);

      const result = {
        actual: getComputedStyle(element).color,
        expected: getComputedStyle(reference).color,
      };
      reference.remove();
      return result;
    });
    expect(await colorChannels(page, hoverColors.actual)).toEqual(
      await colorChannels(page, hoverColors.expected)
    );
  }

  await link.evaluate(element => element.remove());
});
