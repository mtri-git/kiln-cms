import { text } from 'drizzle-orm/sqlite-core'

/**
 * SEO columns for content tables
 * Includes: metaTitle, metaDescription, metaKeywords
 */
export const seoColumns = {
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
}
