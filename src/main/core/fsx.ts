import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Small atomic JSON store: writes a sibling temp file and renames it, so a
 * crash never leaves a half-written settings/instance file behind.
 */
export class JsonFile<T> {
  private readonly file: string
  private cache: T | null = null

  constructor(file: string) {
    this.file = file
  }

  async read(load: (raw: unknown) => T, fallback: () => T): Promise<T> {
    if (this.cache !== null) return this.cache
    try {
      const text = await readFile(this.file, 'utf8')
      this.cache = load(JSON.parse(text) as unknown)
    } catch {
      this.cache = fallback()
    }
    return this.cache
  }

  async write(value: T): Promise<void> {
    this.cache = value
    await mkdir(dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temp, this.file)
  }

  async remove(): Promise<void> {
    this.cache = null
    await rm(this.file, { force: true })
  }

  get path(): string {
    return this.file
  }
}

export async function readJsonIfExists<T>(file: string, load: (raw: unknown) => T): Promise<T | null> {
  try {
    return load(JSON.parse(await readFile(file, 'utf8')) as unknown)
  } catch {
    return null
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = join(dirname(file), `.${process.pid}-${Date.now()}.tmp`)
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temp, file)
}
