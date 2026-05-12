// 用量明细：Phase 6 仅占位 + 跳云端控制台。
// 灵境云端有详细用量 API（/api/log/self、/api/log/usage 等），Phase 6.1+ 再接。

import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ipc } from '@/services/ipc'

export function UsagePage() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Button asChild size="sm" variant="ghost">
          <Link to="/account">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回账号
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">用量明细</CardTitle>
            <CardDescription>本月各模型调用次数、token 消耗</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              详细图表 Phase 6.1+ 接入。
              <br />
              现在可以到云端控制台查看。
            </div>
            <Button size="sm" onClick={() => ipc.openExternal('https://api.aitoken.homes/console/log')}>
              在控制台查看 <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
