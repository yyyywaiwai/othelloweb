import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildStamp = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const timestamp = Number(
      execSync('git log -1 --format=%ct', { encoding: 'utf8' }).trim()
    )
    const message = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim()
    if (!Number.isFinite(timestamp)) throw new Error('invalid timestamp')

    const date = new Date(timestamp * 1000)
    const pad = (value: number) => value.toString().padStart(2, '0')
    const formattedDate =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

    return `【${formattedDate}】${hash}: ${message}`
  } catch (error) {
    console.warn('Failed to derive git build stamp', error)
    return '【unknown】unknown: unknown'
  }
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['othello.yyyywaiwai.com'],
  },
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
})
