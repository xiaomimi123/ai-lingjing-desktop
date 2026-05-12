// 通信渠道页（MVP）。
// channels.status 只读展示当前配置；OAuth 配对走 openclaw channels CLI（v1.1+ 内置）。

import { useCallback, useEffect, useState } from 'react'
import {
  MessageCircle,
  RefreshCw,
  Terminal as TerminalIcon,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getChannelsStatus, type ChannelsStatus } from '@/services/channels-api'
import { ipc } from '@/services/ipc'

const OPENCLAW_CHANNELS_DOC = 'https://github.com/openclaw/openclaw#channels'

export function ChannelsPage() {
  const [status, setStatus] = useState<ChannelsStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await getChannelsStatus())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const channelCount = status?.channelOrder.length ?? 0
  const isEmpty = channelCount === 0

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">通信渠道</h1>
            <p className="text-sm text-muted-foreground">
              让 Agent 主动通过 Slack / 飞书 / 微信 / 邮件 等渠道发消息。MVP 只读，
              配对/认证暂时走 openclaw CLI。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? 'mr-1 h-3.5 w-3.5 animate-spin' : 'mr-1 h-3.5 w-3.5'} />
            刷新
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {isEmpty ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-50" />
              <div>没有配置任何渠道</div>
              <div className="max-w-md text-xs">
                MVP 阶段配对流程走 openclaw 命令行。在终端运行：
              </div>
              <code className="rounded bg-muted px-3 py-2 font-mono text-[11px]">
                openclaw channels add --type slack
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => ipc.openExternal(OPENCLAW_CHANNELS_DOC)}
              >
                查看 OpenClaw 文档 <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">已配置渠道（{channelCount}）</CardTitle>
              <CardDescription>仅展示当前状态，修改需用 openclaw CLI</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96">
                <div className="flex flex-col gap-2">
                  {status?.channelOrder.map((cid) => (
                    <div
                      key={cid}
                      data-testid="channel-row"
                      data-channel-id={cid}
                      className="flex items-center justify-between rounded-md border bg-card p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {status.channelLabels[cid] ?? cid}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">{cid}</div>
                        {status.channelDetailLabels?.[cid] && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {status.channelDetailLabels[cid]}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalIcon className="h-4 w-4" /> 添加渠道（CLI）
            </CardTitle>
            <CardDescription>
              OpenClaw 支持 Slack / Discord / 飞书 / 钉钉 / Telegram / IMAP 等。每种走不同认证流程。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">
{`# Slack（需要 webhook URL）
openclaw channels add --type slack

# 飞书（需要应用 ID + Secret）
openclaw channels add --type feishu

# 邮件（IMAP + SMTP）
openclaw channels add --type email

# 查看已配置
openclaw channels list`}
            </pre>
            <div className="text-muted-foreground">
              配对完成后回到此页面，点右上「刷新」会看到。v1.1 计划内置 OAuth 流程。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
