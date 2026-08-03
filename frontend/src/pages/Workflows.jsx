import { useState, useEffect } from 'react'
import {
  GitBranch, CheckCircle, XCircle, Clock, RefreshCw, X,
  User, Calendar, FileText, AlertCircle, Filter,
  ThumbsUp, ThumbsDown, Eye, MessageSquare, Plus
} from 'lucide-react'
import {
  getWorkflowRequests, approveWorkflow, rejectWorkflow,
  createWorkflowRequest
} from '../api'

export default function Workflows() {
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showReject, setShowReject] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [message, setMessage]     = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'Admin'

  useEffect(() => { load() }, [statusFilter])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getWorkflowRequests(statusFilter === 'all' ? null : statusFilter)
      setRequests(data.requests || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load requests')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleApprove = async (request) => {
    if (!confirm(`Approve this request?\n\nType: ${request.type}\nTarget: ${request.target}\n\nThis will execute the request.`)) return
    try {
      const result = await approveWorkflow(request.id)
      showMsg('success', `Request approved! ${result.message}`)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Approve failed')
    }
  }

  const handleReject = (request) => {
    setSelectedRequest(request)
    setShowReject(true)
  }

  // ── Count stats ──
  const counts = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    completed: requests.filter(r => r.status === 'completed').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <GitBranch size={28} className="text-purple-400" />
            Workflow Approvals
          </h1>
          <p className="text-slate-400">
            {isAdmin ? 'Review and approve change requests' : 'Submit and track your change requests'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2">
            <Plus size={16} /> New Request
          </button>
          <button onClick={load} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Message ─────────────────────────────── */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── Info Banner ─────────────────────────── */}
      {!isAdmin && (
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
              <AlertCircle size={20} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-blue-300 mb-1">Approval Workflow</h3>
              <p className="text-sm text-slate-300">
                Submit change requests that require admin approval. Useful for sensitive operations
                or when you need a paper trail. An admin will review your request and approve or reject it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Clock} label="Pending" value={counts.pending} color="yellow"
          onClick={() => setStatusFilter('pending')}
          active={statusFilter === 'pending'}
        />
        <StatCard
          icon={CheckCircle} label="Approved" value={counts.approved} color="green"
          onClick={() => setStatusFilter('approved')}
          active={statusFilter === 'approved'}
        />
        <StatCard
          icon={CheckCircle} label="Completed" value={counts.completed} color="blue"
          onClick={() => setStatusFilter('completed')}
          active={statusFilter === 'completed'}
        />
        <StatCard
          icon={XCircle} label="Rejected" value={counts.rejected} color="red"
          onClick={() => setStatusFilter('rejected')}
          active={statusFilter === 'rejected'}
        />
      </div>

      {/* ── Filter ──────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2">
        <Filter size={16} className="text-slate-400" />
        <span className="text-sm text-slate-400">Showing:</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Requests</option>
          <option value="pending">Pending Only</option>
          <option value="approved">Approved Only</option>
          <option value="completed">Completed Only</option>
          <option value="rejected">Rejected Only</option>
        </select>
      </div>

      {/* ── Requests List ───────────────────────── */}
      {loading ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
          <p>Loading requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <GitBranch size={48} className="mx-auto mb-3 text-slate-600" />
          <p>No {statusFilter !== 'all' ? statusFilter : ''} requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <RequestCard
              key={req.id}
              request={req}
              isAdmin={isAdmin}
              currentUser={user.username}
              onApprove={() => handleApprove(req)}
              onReject={() => handleReject(req)}
              onView={() => setSelectedRequest(req)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────── */}
      {showReject && selectedRequest && (
        <RejectModal
          request={selectedRequest}
          onClose={() => { setShowReject(false); setSelectedRequest(null) }}
          onSuccess={(msg) => {
            showMsg('success', msg)
            setShowReject(false)
            setSelectedRequest(null)
            load()
          }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {selectedRequest && !showReject && (
        <ViewRequestModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {showCreate && (
        <CreateRequestModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, onClick, active }) {
  const colors = {
    yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
    green:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400'  },
    blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400'   },
    red:    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400'    },
  }
  const c = colors[color]
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border transition ${c.bg} ${c.border} ${
        active ? 'ring-2 ring-blue-500' : 'hover:opacity-80'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon size={18} className={c.text} />
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// Request Card
// ─────────────────────────────────────────────────────────
function RequestCard({ request, isAdmin, currentUser, onApprove, onReject, onView }) {
  const statusColors = {
    pending:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved:  'bg-green-500/20 text-green-400 border-green-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    rejected:  'bg-red-500/20 text-red-400 border-red-500/30',
  }

  const typeIcons = {
    'modify-user': '✏️',
    'create-user': '➕',
    'delete-user': '🗑️',
    'reset-password': '🔑',
    'disable-user': '❌',
    'enable-user': '✅',
  }

  const typeLabels = {
    'modify-user': 'Modify User',
    'create-user': 'Create User',
    'delete-user': 'Delete User',
    'reset-password': 'Reset Password',
    'disable-user': 'Disable User',
    'enable-user': 'Enable User',
  }

  const canAction = isAdmin && request.status === 'pending'
  let payload = {}
  try { payload = JSON.parse(request.payload || '{}') } catch {}

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition">
      <div className="flex items-start justify-between gap-4">
        {/* Left side - Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{typeIcons[request.type] || '📋'}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg">{typeLabels[request.type] || request.type}</h3>
              <div className="text-sm text-slate-400">
                Target: <span className="font-mono text-slate-200">{request.target}</span>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[request.status]}`}>
              {request.status.toUpperCase()}
            </span>
          </div>

          {request.reason && (
            <div className="mb-3 p-2 bg-slate-900 rounded text-sm">
              <span className="text-slate-500 text-xs">REASON: </span>
              <span className="text-slate-200">{request.reason}</span>
            </div>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <User size={12} />
              By: <span className="text-slate-300">{request.requestedBy}</span>
              {request.requestedBy === currentUser && <span className="text-blue-400">(you)</span>}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {new Date(request.createdAt).toLocaleString()}
            </span>
            {request.approvedBy && (
              <span className="flex items-center gap-1">
                <CheckCircle size={12} />
                {request.status === 'rejected' ? 'Rejected' : 'Approved'} by:
                <span className="text-slate-300">{request.approvedBy}</span>
              </span>
            )}
          </div>

          {/* Rejection reason */}
          {request.rejectionReason && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm">
              <span className="text-red-400 text-xs font-medium">REJECTED:</span>
              <span className="text-slate-300 ml-2">{request.rejectionReason}</span>
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={onView}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-1"
            title="View Details"
          >
            <Eye size={14} /> View
          </button>
          {canAction && (
            <>
              <button
                onClick={onApprove}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-1"
                title="Approve & Execute"
              >
                <ThumbsUp size={14} /> Approve
              </button>
              <button
                onClick={onReject}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm flex items-center gap-1"
                title="Reject"
              >
                <ThumbsDown size={14} /> Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Modal Wrapper
// ─────────────────────────────────────────────────────────
function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className={`bg-slate-800 border border-slate-700 rounded-xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// View Request Modal
// ─────────────────────────────────────────────────────────
function ViewRequestModal({ request, onClose }) {
  let payload = {}
  try { payload = JSON.parse(request.payload || '{}') } catch {}

  return (
    <Modal title="Request Details" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Request Info */}
        <div className="grid grid-cols-2 gap-3">
          <InfoBlock label="Type" value={request.type} />
          <InfoBlock label="Status" value={request.status} highlight={request.status} />
          <InfoBlock label="Target" value={request.target} mono />
          <InfoBlock label="Request ID" value={`#${request.id}`} />
          <InfoBlock label="Requested By" value={request.requestedBy} />
          <InfoBlock label="Created" value={new Date(request.createdAt).toLocaleString()} />
          {request.approvedBy && (
            <>
              <InfoBlock
                label={request.status === 'rejected' ? 'Rejected By' : 'Approved By'}
                value={request.approvedBy}
              />
              <InfoBlock
                label={request.status === 'rejected' ? 'Rejected At' : 'Approved At'}
                value={request.approvedAt ? new Date(request.approvedAt).toLocaleString() : '—'}
              />
            </>
          )}
        </div>

        {/* Reason */}
        {request.reason && (
          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">REASON</div>
            <div className="text-sm">{request.reason}</div>
          </div>
        )}

        {/* Rejection Reason */}
        {request.rejectionReason && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-xs text-red-400 font-medium mb-1">REJECTION REASON</div>
            <div className="text-sm">{request.rejectionReason}</div>
          </div>
        )}

        {/* Payload */}
        <div className="p-3 bg-slate-900 rounded-lg">
          <div className="text-xs text-slate-500 mb-2">CHANGES TO APPLY</div>
          <pre className="text-xs text-slate-300 overflow-x-auto">
{JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Close</button>
      </div>
    </Modal>
  )
}

function InfoBlock({ label, value, highlight, mono }) {
  const colors = {
    pending:   'text-yellow-400',
    approved:  'text-green-400',
    completed: 'text-blue-400',
    rejected:  'text-red-400',
  }
  return (
    <div className="p-3 bg-slate-900 rounded-lg">
      <div className="text-xs text-slate-500 mb-1">{label.toUpperCase()}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? colors[highlight] : 'text-slate-200'}`}>
        {value}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Reject Modal
// ─────────────────────────────────────────────────────────
function RejectModal({ request, onClose, onSuccess, onError }) {
  const [reason, setReason]       = useState('')
  const [rejecting, setRejecting] = useState(false)

  const handleReject = async () => {
    if (!reason.trim()) {
      onError('Please provide a rejection reason')
      return
    }
    setRejecting(true)
    try {
      await rejectWorkflow(request.id, reason)
      onSuccess(`Request #${request.id} rejected`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Reject failed')
    }
    setRejecting(false)
  }

  return (
    <Modal title="Reject Request" onClose={onClose}>
      <div className="mb-4 p-3 bg-slate-900 rounded-lg">
        <div className="text-xs text-slate-500 mb-1">REJECTING</div>
        <div className="text-sm">
          <strong>{request.type}</strong> for <span className="font-mono">{request.target}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1">Requested by {request.requestedBy}</div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Rejection Reason *</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Please explain why this request is being rejected..."
          rows={4}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          autoFocus
        />
        <p className="text-xs text-slate-500 mt-1">The requester will see this reason</p>
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleReject} disabled={rejecting || !reason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
          <ThumbsDown size={16} />
          {rejecting ? 'Rejecting...' : 'Reject Request'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Create Request Modal
// ─────────────────────────────────────────────────────────
function CreateRequestModal({ onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    type: 'modify-user',
    target: '',
    reason: '',
    changes: {},
  })
  const [saving, setSaving] = useState(false)

  const requestTypes = [
    { value: 'modify-user',    label: '✏️ Modify User',    desc: 'Update user attributes' },
    { value: 'create-user',    label: '➕ Create User',    desc: 'Create a new user account' },
    { value: 'delete-user',    label: '🗑️ Delete User',    desc: 'Delete a user account' },
    { value: 'reset-password', label: '🔑 Reset Password', desc: 'Reset a user password' },
    { value: 'disable-user',   label: '❌ Disable User',   desc: 'Disable a user account' },
    { value: 'enable-user',    label: '✅ Enable User',    desc: 'Enable a user account' },
  ]

  const handleSubmit = async () => {
    if (!form.target.trim()) {
      onError('Target is required')
      return
    }
    if (!form.reason.trim()) {
      onError('Please provide a reason for this request')
      return
    }

    setSaving(true)
    try {
      await createWorkflowRequest(form)
      onSuccess('Request submitted for approval')
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Submit failed')
    }
    setSaving(false)
  }

  const renderChangeFields = () => {
    if (form.type === 'modify-user') {
      return (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Specify what to change (leave blank to skip)</p>
          <Input
            label="Department"
            value={form.changes.department || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, department: v } })}
          />
          <Input
            label="Title"
            value={form.changes.title || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, title: v } })}
          />
          <Input
            label="Email"
            value={form.changes.email || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, email: v } })}
          />
          <Input
            label="Phone"
            value={form.changes.phone || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, phone: v } })}
          />
        </div>
      )
    }

    if (form.type === 'reset-password') {
      return (
        <div className="space-y-3">
          <Input
            label="New Password *"
            type="password"
            value={form.changes.password || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, password: v } })}
            placeholder="Min 8 characters"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.changes.forceChange !== false}
              onChange={e => setForm({ ...form, changes: { ...form.changes, forceChange: e.target.checked } })}
            />
            <span className="text-sm">Force user to change password at next login</span>
          </label>
        </div>
      )
    }

    if (form.type === 'create-user') {
      return (
        <div className="space-y-3">
          <Input
            label="First Name *"
            value={form.changes.firstName || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, firstName: v } })}
          />
          <Input
            label="Last Name"
            value={form.changes.lastName || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, lastName: v } })}
          />
          <Input
            label="Email"
            value={form.changes.email || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, email: v } })}
          />
          <Input
            label="Password *"
            type="password"
            value={form.changes.password || ''}
            onChange={v => setForm({ ...form, changes: { ...form.changes, password: v } })}
          />
        </div>
      )
    }

    return (
      <div className="p-3 bg-slate-900 rounded-lg text-sm text-slate-400">
        No additional details needed for this request type.
      </div>
    )
  }

  return (
    <Modal title="Submit New Request" onClose={onClose} wide>
      <p className="text-sm text-slate-400 mb-4">
        Submit a request for an admin to approve. This is useful for changes that require oversight.
      </p>

      <div className="space-y-5">
        {/* Type Selection */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Request Type *</label>
          <div className="grid grid-cols-2 gap-2">
            {requestTypes.map(rt => (
              <button
                key={rt.value}
                onClick={() => setForm({ ...form, type: rt.value, changes: {} })}
                className={`p-3 rounded-lg border text-left transition ${
                  form.type === rt.value
                    ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                    : 'bg-slate-900 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <div className="font-medium text-sm">{rt.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{rt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Target */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Target Username *</label>
          <input
            type="text"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            placeholder={form.type === 'create-user' ? "New username (e.g. jdoe)" : "Existing username"}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Changes (dynamic based on type) */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Details</label>
          {renderChangeFields()}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Reason for Request *</label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Why is this change needed? (e.g. New employee starting Monday, User is leaving company, etc.)"
            rows={3}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
          <GitBranch size={16} />
          {saving ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Input Component
// ─────────────────────────────────────────────────────────
function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}