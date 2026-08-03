import { useState, useEffect, useRef } from 'react'
import {
  Camera, Upload, Trash2, X, RefreshCw, Search,
  User, Image as ImageIcon, AlertCircle, CheckCircle,
  Filter, Download, ZoomIn
} from 'lucide-react'
import {
  getUsers, getUserPhotoUrl, uploadUserPhoto, deleteUserPhoto
} from '../api'

export default function Photos() {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [photoFilter, setPhotoFilter] = useState('all')  // all | with | without
  const [message, setMessage]     = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)  // To force img reload
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const canEdit = user.role === 'Admin' || user.role === 'Helpdesk'

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getUsers()
      setUsers(data.users || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load users')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleUploadClick = (u) => {
    setSelectedUser(u)
    setShowUpload(true)
  }

  const handleDelete = async (username) => {
    if (!confirm(`Delete photo for ${username}?`)) return
    try {
      await deleteUserPhoto(username)
      showMsg('success', `Photo deleted for ${username}`)
      setRefreshKey(k => k + 1)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  const handlePreview = (u) => {
    if (u.hasPhoto) {
      setSelectedUser(u)
      setShowPreview(true)
    }
  }

  // Filter users
  const filteredUsers = users.filter(u => {
    if (photoFilter === 'with' && !u.hasPhoto) return false
    if (photoFilter === 'without' && u.hasPhoto) return false
    if (search) {
      const q = search.toLowerCase()
      return u.username.toLowerCase().includes(q) ||
             (u.displayName || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q)
    }
    return true
  })

  const stats = {
    total: users.length,
    withPhoto: users.filter(u => u.hasPhoto).length,
    withoutPhoto: users.filter(u => !u.hasPhoto).length,
  }

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <Camera size={28} className="text-pink-400" />
            User Photos
          </h1>
          <p className="text-slate-400">Manage profile photos for AD users</p>
        </div>
        <button onClick={load} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
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

      {/* ── Stats ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatCard icon={User} label="Total Users" value={stats.total} color="blue" />
        <StatCard icon={ImageIcon} label="With Photo" value={stats.withPhoto} color="green" />
        <StatCard icon={AlertCircle} label="Without Photo" value={stats.withoutPhoto} color="yellow" />
      </div>

      {/* ── Info Banner ─────────────────────────── */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
            <Camera size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-blue-300 mb-1">Photo Requirements</h3>
            <p className="text-sm text-slate-300">
              Photos are stored in AD as <code className="px-1 bg-slate-800 rounded text-xs">thumbnailPhoto</code> attribute (max 100KB).
              Recommended size: <strong>96×96 pixels</strong> in JPEG format.
              Photos appear in Outlook, Teams, and SharePoint.
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="mb-6 flex gap-2 flex-wrap">
        <div className="flex-1 relative min-w-[300px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, username, email..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-pink-500"
          />
        </div>
        <div className="flex gap-2 items-center bg-slate-800 border border-slate-700 rounded-lg px-3">
          <Filter size={16} className="text-slate-400" />
          <select
            value={photoFilter}
            onChange={(e) => setPhotoFilter(e.target.value)}
            className="bg-transparent py-2 focus:outline-none cursor-pointer"
          >
            <option value="all">All Users</option>
            <option value="with">With Photo</option>
            <option value="without">Without Photo</option>
          </select>
        </div>
      </div>

      {/* ── Users Grid ──────────────────────────── */}
      {loading ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
          <p>Loading users...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <Camera size={48} className="mx-auto mb-3 text-slate-600" />
          <p>No users {search ? 'match your search' : 'found'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredUsers.map(u => (
            <UserPhotoCard
              key={u.id}
              user={u}
              canEdit={canEdit}
              refreshKey={refreshKey}
              onUpload={() => handleUploadClick(u)}
              onDelete={() => handleDelete(u.username)}
              onPreview={() => handlePreview(u)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────── */}
      {showUpload && selectedUser && (
        <UploadModal
          user={selectedUser}
          onClose={() => { setShowUpload(false); setSelectedUser(null) }}
          onSuccess={(msg) => {
            showMsg('success', msg)
            setShowUpload(false)
            setSelectedUser(null)
            setRefreshKey(k => k + 1)
            load()
          }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showPreview && selectedUser && (
        <PreviewModal
          user={selectedUser}
          refreshKey={refreshKey}
          onClose={() => { setShowPreview(false); setSelectedUser(null) }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/30',
    green:  'text-green-400 bg-green-500/10 border-green-500/30',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  }
  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={20} />
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// User Photo Card
// ─────────────────────────────────────────────────────────
function UserPhotoCard({ user, canEdit, refreshKey, onUpload, onDelete, onPreview }) {
  const [imgError, setImgError] = useState(false)

  // Reset error state when refreshKey changes
  useEffect(() => {
    setImgError(false)
  }, [refreshKey])

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-pink-500/50 transition group">
      {/* Photo / Placeholder */}
      <div className="relative aspect-square mb-3 bg-slate-900 rounded-lg overflow-hidden">
        {user.hasPhoto && !imgError ? (
          <>
            <img
              src={`${getUserPhotoUrl(user.username)}?t=${refreshKey}`}
              alt={user.displayName || user.username}
              className="w-full h-full object-cover cursor-pointer"
              onClick={onPreview}
              onError={() => setImgError(true)}
            />
            <button
              onClick={onPreview}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg opacity-0 group-hover:opacity-100 transition"
              title="Preview"
            >
              <ZoomIn size={14} className="text-white" />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={48} className="text-slate-600" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mb-3">
        <h3 className="font-medium text-sm truncate" title={user.displayName || user.username}>
          {user.displayName || user.username}
        </h3>
        <p className="text-xs text-slate-400 truncate">{user.username}</p>
        {user.department && (
          <p className="text-xs text-slate-500 truncate" title={user.department}>
            {user.department}
          </p>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-1">
          <button
            onClick={onUpload}
            className="flex-1 px-2 py-1.5 bg-pink-600 hover:bg-pink-700 rounded text-xs flex items-center justify-center gap-1"
            title="Upload Photo"
          >
            <Upload size={12} />
            {user.hasPhoto ? 'Change' : 'Upload'}
          </button>
          {user.hasPhoto && (
            <button
              onClick={onDelete}
              className="px-2 py-1.5 bg-slate-700 hover:bg-red-600 rounded text-xs"
              title="Delete Photo"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Upload Modal
// ─────────────────────────────────────────────────────────
function UploadModal({ user, onClose, onSuccess, onError }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)
  const [croppedFile, setCroppedFile] = useState(null)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    
    if (!f.type.startsWith('image/')) {
      onError('Please select an image file')
      return
    }
    
    if (f.size > 5 * 1024 * 1024) {
      onError('Image too large (max 5MB before processing)')
      return
    }
    
    setFile(f)
    const reader = new FileReader()
    reader.onload = (evt) => {
      setPreview(evt.target.result)
      processImage(evt.target.result)
    }
    reader.readAsDataURL(f)
  }

  // Resize and compress image to fit AD limits (100KB)
  const processImage = (dataUrl) => {
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      
      const ctx = canvas.getContext('2d')
      const size = 200  // 200x200 final
      
      canvas.width = size
      canvas.height = size
      
      // Calculate crop (center square)
      const minDim = Math.min(img.width, img.height)
      const sx = (img.width - minDim) / 2
      const sy = (img.height - minDim) / 2
      
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
      
      // Compress to JPEG with quality adjustment to fit under 100KB
      let quality = 0.85
      let blob = null
      const tryCompress = (q) => {
        return new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', q)
        })
      }
      
      const compress = async () => {
        for (let q = 0.85; q >= 0.3; q -= 0.1) {
          blob = await tryCompress(q)
          if (blob && blob.size < 95000) break  // Leave room
        }
        if (blob) {
          setCroppedFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
        }
      }
      
      compress()
    }
    img.src = dataUrl
  }

  const handleUpload = async () => {
    if (!croppedFile) {
      onError('Please select an image first')
      return
    }
    
    setUploading(true)
    try {
      await uploadUserPhoto(user.username, croppedFile)
      onSuccess(`Photo uploaded for ${user.username}`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Upload failed')
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Upload Photo</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-900 rounded-lg">
          <div className="text-xs text-slate-400">User</div>
          <div className="font-medium">{user.displayName || user.username}</div>
          <div className="text-xs text-slate-500">{user.username}</div>
        </div>

        {/* Preview area */}
        <div className="mb-4">
          {preview ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Original</div>
                  <div className="aspect-square bg-slate-900 rounded-lg overflow-hidden">
                    <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Cropped (200×200)</div>
                  <div className="aspect-square bg-slate-900 rounded-lg overflow-hidden">
                    <canvas ref={canvasRef} className="w-full h-full" />
                  </div>
                </div>
              </div>
              {croppedFile && (
                <div className="text-xs text-slate-500 text-center">
                  Size: {(croppedFile.size / 1024).toFixed(1)} KB
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square bg-slate-900 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 transition"
            >
              <Upload size={48} className="text-slate-600 mb-3" />
              <p className="text-sm text-slate-400">Click to select image</p>
              <p className="text-xs text-slate-500 mt-1">JPEG, PNG, GIF (max 5MB)</p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-300">
          <strong>ℹ️ Note:</strong> Image will be cropped to square and resized to 200×200 px, compressed to fit AD's 100KB limit.
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
            Cancel
          </button>
          {preview && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              Change Image
            </button>
          )}
          <button
            onClick={handleUpload}
            disabled={uploading || !croppedFile}
            className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Upload size={16} />
            {uploading ? 'Uploading...' : 'Upload Photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Preview Modal
// ─────────────────────────────────────────────────────────
function PreviewModal({ user, refreshKey, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
         onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-lg w-full"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">{user.displayName || user.username}</h3>
            <p className="text-sm text-slate-400">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="bg-slate-900 rounded-lg overflow-hidden">
          <img
            src={`${getUserPhotoUrl(user.username)}?t=${refreshKey}`}
            alt={user.displayName || user.username}
            className="w-full h-auto"
          />
        </div>

        {user.email && (
          <div className="mt-4 text-sm text-slate-400 text-center">
            {user.email}
          </div>
        )}
      </div>
    </div>
  )
}