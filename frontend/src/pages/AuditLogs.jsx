import { useState, useEffect } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { getAuditLogs, exportAuditLogs } from '../api'

export default function AuditLogs() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getAuditLogs({ limit: 200 })
      setLogs(data.logs || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const handleExport = async () => {
    try {
      const res  = await exportAuditLogs()
      const url  = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href     = url
      link.download = `audit-${Date.now()}.csv`
      link.click()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Audit Logs</h1>
          <p className="text-slate-400">{logs.length} recent entries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={load} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr className="text-left text-xs uppercase text-slate-400">
              <th className="p-3">Time</th>
              <th className="p-3">Operator</th>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Status</th>
              <th className="p-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-700/30 text-sm">
                <td className="p-3 text-slate-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="p-3">{log.operator}</td>
                <td className="p-3">{log.action}</td>
                <td className="p-3 text-slate-400">{log.objectName}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    log.status === 'Success'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {log.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-500">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}