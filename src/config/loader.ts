import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { Config, ConfigSchema } from './types'

export function loadConfig(configPath: string): Config {
  const absolutePath = path.resolve(configPath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`)
  }
  const raw = fs.readFileSync(absolutePath, 'utf8')
  const parsed = yaml.load(raw)
  return ConfigSchema.parse(parsed)
}

export function saveConfig(configPath: string, config: Config): void {
  const absolutePath = path.resolve(configPath)
  const content = yaml.dump(config, { indent: 2, lineWidth: 120 })
  fs.writeFileSync(absolutePath, content, 'utf8')
}

export function setConfigValue(config: Config, keyPath: string, value: string): Config {
  const keys = keyPath.split('.')
  const updated = JSON.parse(JSON.stringify(config)) as Record<string, unknown>
  let current = updated
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== 'object' || current[keys[i]] === null) {
      current[keys[i]] = {}
    }
    current = current[keys[i]] as Record<string, unknown>
  }
  const lastKey = keys[keys.length - 1]
  if (value === 'true') current[lastKey] = true
  else if (value === 'false') current[lastKey] = false
  else if (!isNaN(Number(value)) && value !== '') current[lastKey] = Number(value)
  else current[lastKey] = value
  return ConfigSchema.parse(updated)
}

export function getConfigValue(config: Config, keyPath: string): unknown {
  const keys = keyPath.split('.')
  let current: unknown = config
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
