import { expect, test } from '@playwright/test';

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
      reference.style.borderColor = 'var(--border)';
      document.body.appendChild(reference);

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
        border: referenceStyle.borderTopColor,
        primary: getComputedStyle(primaryReference).color,
      };

      reference.remove();
      primaryReference.remove();
      return result;
    });

    expect(styles.articleColor).toBe(styles.foreground);
    expect(styles.headingColor).toBe(styles.foreground);
    expect(styles.headingBorderColor).toBe(styles.border);
    expect(styles.headingBorderStyle).toBe('solid');
    expect(styles.headingBorderWidth).toBe('1px');
    expect(styles.linkColor).toBe(styles.primary);

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
    expect(hoverColors.actual).toBe(hoverColors.expected);
  }

  await link.evaluate(element => element.remove());
});
