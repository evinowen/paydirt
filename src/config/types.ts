import { z } from 'zod';

export const SearchConfigSchema = z.object({
  interval: z.number().min(1).default(60),
  keywords: z.array(z.string()).min(1),
  location: z.string(),
  remote: z.boolean().optional(),
  salary_min: z.number().optional(),
  experience_level: z.enum(['entry', 'mid', 'senior']).optional(),
});

export const PlatformConfigSchema = z.object({
  enabled: z.boolean().default(true),
  email: z.string().email(),
  password: z.string(),
});

export const LinkedInConfigSchema = PlatformConfigSchema.extend({
  easy_apply_only: z.boolean().optional(),
});

export const ApplyConfigSchema = z.object({
  cover_letter: z.boolean().optional(),
  cover_letter_template: z.string().optional(),
});

export const FiltersConfigSchema = z.object({
  exclude_companies: z.array(z.string()).optional(),
  exclude_keywords: z.array(z.string()).optional(),
});

export const ConfigSchema = z.object({
  search: SearchConfigSchema,
  resume: z.object({ path: z.string() }),
  linkedin: LinkedInConfigSchema.optional(),
  indeed: PlatformConfigSchema.optional(),
  glassdoor: PlatformConfigSchema.optional(),
  apply: ApplyConfigSchema.optional(),
  filters: FiltersConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
export type LinkedInConfig = z.infer<typeof LinkedInConfigSchema>;
export type ApplyConfig = z.infer<typeof ApplyConfigSchema>;
export type FiltersConfig = z.infer<typeof FiltersConfigSchema>;
