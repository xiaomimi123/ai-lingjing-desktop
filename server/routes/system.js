// /api/system/metrics + /api/npm/* 系统监控和 npm 升级
// 原 server/index.js 第 458-660 行（含 getNetworkStats / getDiskSpace 辅助）。

import { Router } from 'express'
import os from 'os'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import checkDiskSpace from 'check-disk-space'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'

const router = Router()

function getNetworkStats() {
  const platform = os.platform()
  let bytesReceived = 0
  let bytesSent = 0

  try {
    if (platform === 'win32') {
      const output = execSync(
        'powershell -NoProfile -Command "Get-NetAdapterStatistics | ConvertTo-Json"',
        { encoding: 'utf8', timeout: 5000 }
      )
      const stats = JSON.parse(output || '[]')
      const adapters = Array.isArray(stats) ? stats : [stats]
      for (const adapter of adapters) {
        if (adapter) {
          bytesReceived += Number(adapter.ReceivedBytes) || 0
          bytesSent += Number(adapter.SentBytes) || 0
        }
      }
    } else {
      const netDev = readFileSync('/proc/net/dev', 'utf8')
      const lines = netDev.trim().split('\n').slice(2)
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 10) {
          const iface = parts[0].replace(':', '')
          if (iface === 'lo') continue
          bytesReceived += parseInt(parts[1], 10) || 0
          bytesSent += parseInt(parts[9], 10) || 0
        }
      }
    }
  } catch {
    bytesReceived = 0
    bytesSent = 0
  }

  return { bytesReceived, bytesSent }
}

async function getDiskSpace() {
  try {
    const platform = os.platform()
    let checkPath = '/'
    if (platform === 'win32') {
      checkPath = process.env.SystemDrive || 'C:\\'
    }
    const diskSpace = await checkDiskSpace(checkPath)
    return {
      total: diskSpace.size,
      free: diskSpace.free,
      used: diskSpace.size - diskSpace.free,
    }
  } catch {
    return { total: 0, free: 0, used: 0 }
  }
}

router.get('/api/npm/versions', async (req, res) => {
  try {
    const response = await fetch('https://registry.npmjs.org/openclaw')
    if (!response.ok) {
      throw new Error('Failed to fetch versions from npm')
    }
    const data = await response.json()
    const versions = Object.keys(data.versions || {})

    const validVersions = versions.filter(version => /^\d+\.\d+\.\d+/.test(version))
    validVersions.sort((a, b) => {
      const aParts = a.split('.').map(Number)
      const bParts = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        const aVal = aParts[i] || 0
        const bVal = bParts[i] || 0
        if (aVal !== bVal) return bVal - aVal
      }
      return 0
    })

    res.json({ versions: validVersions })
  } catch (error) {
    console.error('[Server] Failed to fetch npm versions:', error.message)
    res.status(500).json({ error: 'Failed to fetch versions from npm' })
  }
})

router.post('/api/npm/update', async (req, res) => {
  try {
    const { version } = req.body
    const packageSpec = version ? `openclaw@${version}` : 'openclaw@latest'
    console.log(`[Server] Updating OpenClaw via npm: ${packageSpec}`)

    const output = execSync(`npm install -g ${packageSpec}`, {
      encoding: 'utf8',
      timeout: 120000,
    })

    console.log('[Server] npm update output:', output)
    res.json({
      ok: true,
      message: `Successfully updated to ${packageSpec}`,
      output,
    })
  } catch (error) {
    console.error('[Server] Failed to update OpenClaw via npm:', error.message)
    res.status(500).json({
      ok: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
    })
  }
})

router.get('/api/system/metrics', authMiddleware, async (req, res) => {
  try {
    const cpus = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    const diskInfo = await getDiskSpace()
    const diskTotal = diskInfo.total
    const diskFree = diskInfo.free

    let cpuUsage = 0
    for (const cpu of cpus) {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      const idle = cpu.times.idle
      cpuUsage += ((total - idle) / total) * 100
    }
    cpuUsage = cpuUsage / cpus.length

    let presence = []
    try {
      if (state.gateway?.isConnected) {
        presence = await state.gateway.call('system-presence')
        if (!Array.isArray(presence)) {
          presence = presence?.presence || presence?.items || presence?.list || []
        }
      }
    } catch {
      presence = []
    }

    let uptime = os.uptime()
    try {
      if (state.gateway?.isConnected) {
        const health = await state.gateway.call('health')
        uptime = health?.uptime || uptime
      }
    } catch {
      // use os uptime
    }

    const networkStats = getNetworkStats()

    res.json({
      ok: true,
      metrics: {
        cpu: {
          usage: Math.round(cpuUsage * 10) / 10,
          cores: cpus.length,
          model: cpus[0]?.model || 'Unknown',
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
        },
        disk: {
          total: diskTotal,
          used: diskTotal - diskFree,
          free: diskFree,
          usagePercent: diskTotal > 0 ? Math.round(((diskTotal - diskFree) / diskTotal) * 1000) / 10 : 0,
        },
        network: {
          bytesReceived: networkStats.bytesReceived,
          bytesSent: networkStats.bytesSent,
        },
        uptime,
        loadAverage: os.loadavg(),
        platform: os.platform(),
        hostname: os.hostname(),
      },
      presence,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export default router
