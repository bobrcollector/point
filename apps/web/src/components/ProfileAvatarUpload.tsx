import { useEffect, useRef, useState } from 'react'
import { IconUser } from './NavGlyphs'

type Props = {
  avatarUrl: string | null
  displayName: string
  onUpload: (file: File) => void
  uploading: boolean
}

export function ProfileAvatarUpload({ avatarUrl, displayName, onUpload, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const shown = preview ?? avatarUrl

  return (
    <div className="avatarUpload">
      <div className="avatarUploadPreview" aria-hidden>
        {shown ? <img src={shown} alt="" /> : <IconUser />}
      </div>
      <div className="avatarUploadBody">
        <div className="avatarUploadName">{displayName}</div>
        <button
          type="button"
          className="homeGhostBtn avatarUploadBtn"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Загрузка…' : shown ? 'Сменить фото' : 'Загрузить фото'}
        </button>
        <p className="pageSub">JPG, PNG, WEBP или GIF, до 5 МБ</p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (preview) URL.revokeObjectURL(preview)
            setPreview(URL.createObjectURL(file))
            onUpload(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
