// Prebuild: copy the source guides + screenshots into the Astro app, rewriting
// for web rendering. The SOURCE OF TRUTH stays docs/user-guides + docs/screenshots;
// these copies are gitignored build artifacts regenerated on every build.
import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const srcGuides = join(repoRoot, 'docs/user-guides');
const srcShots = join(repoRoot, 'docs/screenshots');
const srcDiagrams = join(repoRoot, 'docs/diagrams');
const outGuides = resolve(__dirname, '../src/content/guides');
const outShots = resolve(__dirname, '../public/screenshots');
const outDiagrams = resolve(__dirname, '../public/diagrams');

// Per-guide presentation metadata (landing cards + ordering + sidebar icon).
// `source` overrides the source filename when it differs from the published
// slug (the judge/steward source keeps its printable-quickstart name and is
// also referenced elsewhere, e.g. AskQ document assets).
const META = {
  'exhibitor-guide': {
    title: 'Exhibitor guide',
    role: 'For exhibitors',
    blurb: 'Find a show, add your dog, enter, pay, check in, and see your results.',
    icon: 'paw',
    order: 1,
  },
  'secretary-guide': {
    title: 'Secretary guide',
    role: 'For trial secretaries',
    blurb: 'Create a show, manage entries, run show day, release results, submit to AKC or UKC.',
    icon: 'clipboard',
    order: 2,
  },
  'club-admin-guide': {
    title: 'Club admin & treasurer',
    role: 'For clubs',
    blurb: 'Set up your club, grant show access, connect payments, track payouts.',
    icon: 'building',
    order: 3,
  },
  'judge-steward-guide': {
    source: 'judge-steward-quickstart.md',
    title: 'Judge & steward quickstart',
    role: 'For judges & stewards',
    blurb: 'Get ringside access, score on the tablet, and post results.',
    icon: 'gavel',
    order: 4,
  },
};

function transform(md) {
  let out = md;
  // Drop everything from the internal "Screenshot Checklist" onward.
  const cut = out.search(/\n#{1,3}\s+Screenshot Checklist/i);
  if (cut !== -1) out = out.slice(0, cut);
  // Remove the leading H1 (the layout renders the title from frontmatter).
  out = out.replace(/^\s*#\s+.+\n/, '');
  // Remove the internal metadata block + qa-draft note blockquote.
  out = out.replace(/^\*\*(Status|Audience|Last verified|Verified by):\*\*.*\n/gim, '');
  out = out.replace(/^>\s*\*\*Note:\*\*[\s\S]*?\n\n/m, '');
  // Point images at the public screenshots / diagrams dirs.
  out = out.replace(/\.\.\/screenshots\//g, '/screenshots/');
  out = out.replace(/\.\.\/diagrams\//g, '/diagrams/');
  return out.replace(/^\s+/, '');
}

async function run() {
  await rm(outGuides, { recursive: true, force: true });
  await rm(outShots, { recursive: true, force: true });
  await rm(outDiagrams, { recursive: true, force: true });
  await mkdir(outGuides, { recursive: true });
  await mkdir(outShots, { recursive: true });
  await mkdir(outDiagrams, { recursive: true });

  // Only publish the curated guides in META; source filename defaults to the
  // published slug but can be overridden per entry.
  let count = 0;
  for (const [slug, meta] of Object.entries(META)) {
    const sourceFile = meta.source ?? `${slug}.md`;
    const sourcePath = join(srcGuides, sourceFile);
    if (!existsSync(sourcePath)) {
      console.warn(`[prepare-content] source missing for ${slug}: ${sourceFile}`);
      continue;
    }
    const raw = await readFile(sourcePath, 'utf8');
    // Carry the source's publish status into frontmatter (don't silently drop
    // it) so the site can honestly badge drafts and gate indexing.
    const status = raw.match(/^\*\*Status:\*\*\s*`?([\w-]+)`?/im)?.[1] ?? 'qa-draft';
    const body = transform(raw);
    const fm = [
      '---',
      `title: ${JSON.stringify(meta.title)}`,
      `role: ${JSON.stringify(meta.role)}`,
      `blurb: ${JSON.stringify(meta.blurb)}`,
      `icon: ${JSON.stringify(meta.icon)}`,
      `status: ${JSON.stringify(status)}`,
      `order: ${meta.order}`,
      '---',
      '',
    ].join('\n');
    await writeFile(join(outGuides, `${slug}.md`), fm + body);
    count++;
  }

  if (existsSync(srcShots)) {
    for (const shot of (await readdir(srcShots)).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))) {
      await copyFile(join(srcShots, shot), join(outShots, shot));
    }
  }
  if (existsSync(srcDiagrams)) {
    for (const diagram of (await readdir(srcDiagrams)).filter(f => /\.(svg|png)$/i.test(f))) {
      await copyFile(join(srcDiagrams, diagram), join(outDiagrams, diagram));
    }
  }
  console.log(`[prepare-content] ${count} guides + screenshots + diagrams staged.`);
}

run().catch(err => {
  console.error('[prepare-content] failed:', err);
  process.exit(1);
});
