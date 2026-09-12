import React, { useRef } from 'react'
import { Paperclip, Trash2 } from 'lucide-react'

const MAX_FILES = 10
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EmailAttachmentPicker({ attachments, onChange, disabled = false }) {
  const inputRef = useRef(null)

  async function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    if (attachments.length + files.length > MAX_FILES) {
      window.alert(`You can attach up to ${MAX_FILES} files.`)
      return
    }

    const existingBytes = attachments.reduce((sum, item) => sum + (item.size || 0), 0)
    const selectedBytes = files.reduce((sum, file) => sum + file.size, 0)

    if (existingBytes + selectedBytes > MAX_TOTAL_BYTES) {
      window.alert('Email attachments cannot exceed 25 MB in total.')
      return
    }

    try {
      const converted = await Promise.all(files.map(async (file) => ({
        name: file.name,
        content: await fileToBase64(file),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      })))
      onChange([...attachments, ...converted])
    } catch (error) {
      console.error('Could not prepare email attachment:', error)
      window.alert('One of the selected files could not be prepared for email.')
    }
  }

  function removeAttachment(index) {
    onChange(attachments.filter((_, itemIndex) => itemIndex !== index))
  }

  const totalBytes = attachments.reduce((sum, item) => sum + (item.size || 0), 0)

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <input ref={inputRef} type="file" multiple hidden onChange={handleFiles} disabled={disabled} />
      <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={disabled || attachments.length >= MAX_FILES}>
        <Paperclip size={16} /> Attach files
      </button>

      {attachments.length > 0 && (
        <div style={{ display: 'grid', gap: '6px' }}>
          {attachments.map((item, index) => (
            <div key={`${item.name}-${index}`} className="list-row" style={{ alignItems: 'center', gap: '10px' }}>
              <Paperclip size={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{item.name}</strong>
                <div className="muted" style={{ fontSize: '12px' }}>{formatBytes(item.size || 0)}</div>
              </div>
              <button type="button" className="icon-button danger" title="Remove attachment" onClick={() => removeAttachment(index)} disabled={disabled}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="muted" style={{ fontSize: '12px' }}>
            {attachments.length}/{MAX_FILES} files · {formatBytes(totalBytes)}/25 MB
          </div>
        </div>
      )}
    </div>
  )
}
