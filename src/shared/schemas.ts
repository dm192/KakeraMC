import { z } from 'zod'

export const loaderTypeSchema = z.enum(['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'])
export const languageSchema = z.enum(['zh-CN', 'en'])

export const settingsSchema = z.object({
  language: languageSchema,
  /** Directory that holds versions/, libraries/, assets/, runtime/ and instances/. */
  gameRoot: z.string().min(1),
  memoryMb: z.number().int().min(512).max(65_536),
  jvmArgs: z.array(z.string()).max(64),
  downloadConcurrency: z.number().int().min(1).max(32),
  javaPath: z.string().min(1).nullable(),
  microsoftClientId: z.string().trim().min(1).nullable()
})

export const settingsPatchSchema = settingsSchema.partial()

export const createInstanceInputSchema = z.object({
  name: z.string().trim().min(1).max(48),
  mcVersion: z.string().trim().min(1).max(64),
  loader: loaderTypeSchema,
  loaderVersion: z.string().trim().min(1).max(64).optional()
})

export const instanceRenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(48)
})

export const instanceIdSchema = z.object({
  id: z.string().min(1).max(64)
})

export const loaderQuerySchema = z.object({
  mcVersion: z.string().trim().min(1).max(64),
  loader: loaderTypeSchema
})

export const taskIdSchema = z.object({
  id: z.string().min(1).max(64)
})

export const logsTailSchema = z.object({
  id: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(5_000).default(400)
})

export const offlineAccountSchema = z.object({
  name: z.string().trim().min(3).max(16).regex(/^[A-Za-z0-9_]+$/)
})
