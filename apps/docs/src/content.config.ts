import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    role: z.string(),
    blurb: z.string(),
    icon: z.string(),
    status: z.string().default('qa-draft'),
    order: z.number(),
  }),
});

export const collections = { guides };
