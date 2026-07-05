import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, CircleAlert, IdCard, Save, User, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useProfileStore } from '@/store/useProfileStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_IMAGE_SIZE = 512;

const profileCopy = {
  'zh-CN': {
    emailInvalid: '邮箱格式不正确',
    phoneInvalid: '手机号格式不正确',
    avatarTooLarge: '头像图片必须小于 5MB',
    fixErrors: '请先修正表单中的错误',
    justSaved: '刚刚已保存',
    saveFailed: '个人资料保存失败：{{error}}',
    saving: '保存中...',
    dirty: '有未保存修改',
    synced: '资料已同步到本机',
    noSignature: '暂无个性签名',
    avatarTooltip: '点击上传头像，支持 PNG/JPG/WebP/GIF，小于 5MB',
    localIdentity: '本机显示身份',
    localFieldHint: '仅作为本机资料字段，不会自动公开。',
    signaturePlaceholder: '写一句给自己看的状态或目标',
    accountRelation: '账号关系',
    loggedInPrefix: '当前登录账号：',
    loggedInSuffix: '。个人资料用于本机侧边栏和本机展示，账号信息用于登录和同步，两者可以不同。',
    loggedOut: '当前未登录。个人资料仍会保存在本机，用于侧边栏和本机展示。',
    cancelChanges: '取消修改',
    savingShort: '保存中',
    saved: '已保存',
  },
  'zh-TW': {
    emailInvalid: '電子郵件格式不正確',
    phoneInvalid: '手機號格式不正確',
    avatarTooLarge: '頭像圖片必須小於 5MB',
    fixErrors: '請先修正表單中的錯誤',
    justSaved: '剛剛已儲存',
    saveFailed: '個人資料儲存失敗：{{error}}',
    saving: '儲存中...',
    dirty: '有未儲存修改',
    synced: '資料已同步到本機',
    noSignature: '暫無個性簽名',
    avatarTooltip: '點擊上傳頭像，支援 PNG/JPG/WebP/GIF，小於 5MB',
    localIdentity: '本機顯示身份',
    localFieldHint: '僅作為本機資料欄位，不會自動公開。',
    signaturePlaceholder: '寫一句給自己看的狀態或目標',
    accountRelation: '帳號關係',
    loggedInPrefix: '目前登入帳號：',
    loggedInSuffix: '。個人資料用於本機側邊欄和本機展示，帳號資訊用於登入和同步，兩者可以不同。',
    loggedOut: '目前未登入。個人資料仍會儲存在本機，用於側邊欄和本機展示。',
    cancelChanges: '取消修改',
    savingShort: '儲存中',
    saved: '已儲存',
  },
  en: {
    emailInvalid: 'Invalid email format',
    phoneInvalid: 'Invalid phone number format',
    avatarTooLarge: 'Avatar image must be under 5 MB.',
    fixErrors: 'Fix the form errors first',
    justSaved: 'Saved just now',
    saveFailed: 'Failed to save profile: {{error}}',
    saving: 'Saving...',
    dirty: 'Unsaved changes',
    synced: 'Profile synced to this device',
    noSignature: 'No signature yet',
    avatarTooltip: 'Click to upload. PNG/JPG/WebP/GIF, under 5 MB.',
    localIdentity: 'Local display identity',
    localFieldHint: 'Only used as a local profile field. It is not published automatically.',
    signaturePlaceholder: 'Write a status or goal for yourself',
    accountRelation: 'Account relationship',
    loggedInPrefix: 'Current signed-in account: ',
    loggedInSuffix: '. Profile is used for local sidebar/display. Account info is used for sign-in and sync, and they can be different.',
    loggedOut: 'You are not signed in. Your profile is still saved locally for sidebar and local display.',
    cancelChanges: 'Cancel changes',
    savingShort: 'Saving',
    saved: 'Saved',
  },
} as const;

export function ProfilePage() {
  const { t } = useTranslation();
  const language = useSettingsStore((state) => state.settings.language);
  const copy = profileCopy[language];
  const { profile, fetchProfile, saveProfile } = useProfileStore();
  const session = useAuthStore((state) => state.session);
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [signature, setSignature] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [editingSignature, setEditingSignature] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [signatureDraft, setSignatureDraft] = useState('');
  const hydratedRef = useRef(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || '');
      setPhone(profile.phone || '');
      setEmail(profile.email || '');
      setSignature(profile.signature || '');
      setAvatar(profile.avatar || null);
      setNicknameDraft(profile.nickname || '');
      setSignatureDraft(profile.signature || '');
      hydratedRef.current = true;
    }
  }, [profile]);

  const initialSnapshot = useMemo(() => ({
    nickname: profile?.nickname || '',
    phone: profile?.phone || '',
    email: profile?.email || '',
    signature: profile?.signature || '',
    avatar: profile?.avatar || null,
  }), [profile]);

  const currentSnapshot = { nickname, phone, email, signature, avatar };
  const dirty = hydratedRef.current && JSON.stringify(initialSnapshot) !== JSON.stringify(currentSnapshot);

  const emailError = email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? copy.emailInvalid
    : '';
  const phoneError = phone.trim() && !/^[0-9+\-\s()]{6,20}$/.test(phone.trim())
    ? copy.phoneInvalid
    : '';
  const nicknameRequired = language === 'en'
    ? 'Nickname cannot be empty'
    : language === 'zh-TW'
      ? '暱稱不能為空'
      : '昵称不能为空';

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const onPickAvatar = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
      if (typeof selected !== 'string') return;

      const bytes = await readFile(selected);
      if (bytes.byteLength > MAX_AVATAR_BYTES) {
        toast.error(copy.avatarTooLarge);
        return;
      }
      const ext = selected.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const compressedAvatar = await compressAvatarImage(bytes, mime);
      setAvatar(compressedAvatar);
      setSaving(true);
      await saveProfile({
        nickname: nickname.trim() || undefined,
        avatar: compressedAvatar,
        phone: phone.trim() || null,
        email: email.trim() || null,
        signature: signature.trim() || null,
      });
      setLastSavedText(copy.justSaved);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (emailError || phoneError) {
      toast.error(copy.fixErrors);
      return;
    }
    setSaving(true);
    try {
      await saveProfile({
        nickname: nickname.trim() || undefined,
        avatar: avatar || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        signature: signature.trim() || null,
      });
      setLastSavedText(copy.justSaved);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(copy.saveFailed.replace('{{error}}', String(e)));
    } finally {
      setSaving(false);
    }
  };

  const saveInlineProfile = async (patch: { nickname?: string; signature?: string | null }) => {
    if (emailError || phoneError) {
      toast.error(copy.fixErrors);
      return;
    }
    setSaving(true);
    try {
      await saveProfile({
        nickname: patch.nickname ?? (nickname.trim() || undefined),
        avatar: avatar || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        signature: patch.signature !== undefined ? patch.signature : signature.trim() || null,
      });
      setLastSavedText(copy.justSaved);
      toast.success(copy.saved);
    } catch (e) {
      toast.error(copy.saveFailed.replace('{{error}}', String(e)));
    } finally {
      setSaving(false);
    }
  };

  const saveNickname = async () => {
    const next = nicknameDraft.trim();
    if (!next) {
      toast.error(nicknameRequired);
      return;
    }
    setNickname(next);
    await saveInlineProfile({ nickname: next });
    setEditingNickname(false);
  };

  const cancelNickname = () => {
    setNicknameDraft(nickname);
    setEditingNickname(false);
  };

  const saveSignature = async () => {
    const next = signatureDraft.trim();
    setSignature(next);
    await saveInlineProfile({ signature: next || null });
    setEditingSignature(false);
  };

  const cancelSignature = () => {
    setSignatureDraft(signature);
    setEditingSignature(false);
  };

  const onReset = () => {
    setNickname(initialSnapshot.nickname);
    setPhone(initialSnapshot.phone);
    setEmail(initialSnapshot.email);
    setSignature(initialSnapshot.signature);
    setAvatar(initialSnapshot.avatar);
    setNicknameDraft(initialSnapshot.nickname);
    setSignatureDraft(initialSnapshot.signature);
    setEditingNickname(false);
    setEditingSignature(false);
    setLastSavedText('');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <User size={22} />
          {t('profile.title')}
        </h1>
        <div className="text-xs text-text-muted">
          {saving ? copy.saving : dirty ? copy.dirty : lastSavedText || copy.synced}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
        <aside className="card p-6 h-fit">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={onPickAvatar}
              className="group relative h-24 w-24 overflow-hidden rounded-full border border-border bg-primary text-white shadow-sm transition-all hover:border-primary hover:shadow-md"
              title={copy.avatarTooltip}
            >
              {avatar ? (
                <img src={avatar} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl">
                  {(nickname || 'U').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 hidden flex-col items-center justify-center gap-1 bg-black/55 px-3 text-center text-[11px] leading-4 text-white group-hover:flex">
                <Camera size={16} />
                {copy.avatarTooltip}
              </span>
            </button>
            <div className="mt-4 w-full">
              {editingNickname ? (
                <div className="flex items-center gap-1.5">
                  <input
                    className="input h-9 flex-1 text-center text-base font-semibold"
                    value={nicknameDraft}
                    maxLength={40}
                    autoFocus
                    onChange={(event) => setNicknameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveNickname();
                      if (event.key === 'Escape') cancelNickname();
                    }}
                  />
                  <IconAction label={t('common.save')} onClick={saveNickname} disabled={saving}>
                    <Check size={15} />
                  </IconAction>
                  <IconAction label={copy.cancelChanges} onClick={cancelNickname} disabled={saving}>
                    <X size={15} />
                  </IconAction>
                </div>
              ) : (
                <button
                  type="button"
                  className="max-w-full truncate rounded-md px-2 py-1 text-lg font-semibold transition-colors hover:bg-surface-2"
                  onClick={() => {
                    setNicknameDraft(nickname);
                    setEditingNickname(true);
                  }}
                >
                  {nickname || t('profile.nickname')}
                </button>
              )}
            </div>
            <div className="mt-1 w-full">
              {editingSignature ? (
                <div className="flex items-start gap-1.5">
                  <textarea
                    className="input min-h-[72px] flex-1 resize-none text-sm"
                    value={signatureDraft}
                    maxLength={120}
                    autoFocus
                    placeholder={copy.signaturePlaceholder}
                    onChange={(event) => setSignatureDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') cancelSignature();
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) saveSignature();
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <IconAction label={t('common.save')} onClick={saveSignature} disabled={saving}>
                      <Check size={15} />
                    </IconAction>
                    <IconAction label={copy.cancelChanges} onClick={cancelSignature} disabled={saving}>
                      <X size={15} />
                    </IconAction>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="max-w-[260px] truncate rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
                  onClick={() => {
                    setSignatureDraft(signature);
                    setEditingSignature(true);
                  }}
                >
                  {signature || copy.noSignature}
                </button>
              )}
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <section className="card p-5">
            <div className="text-sm font-semibold flex items-center gap-2 mb-4">
              <IdCard size={16} />
              {copy.localIdentity}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label={t('profile.phone')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={phoneError}
                hint={copy.localFieldHint}
              />
              <Input
                label={t('profile.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                error={emailError}
                hint={copy.localFieldHint}
              />
            </div>
          </section>

          <section className="card p-5">
            <div className="text-sm font-semibold flex items-center gap-2 mb-3">
              <CircleAlert size={16} />
              {copy.accountRelation}
            </div>
            <div className="text-sm text-text-muted leading-6">
              {session ? (
                <>
                  {copy.loggedInPrefix}<span className="text-text font-medium">{session.nickname}</span>{copy.loggedInSuffix}
                </>
              ) : (
                copy.loggedOut
              )}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>{copy.cancelChanges}</Button>
            <Button onClick={onSave} disabled={!dirty || saving}>
              <Save size={15} />
              {saving ? copy.savingShort : t('common.save')}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

async function compressAvatarImage(bytes: Uint8Array, mime: string): Promise<string> {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mime });
  const imageUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(imageUrl);
    const scale = Math.min(1, AVATAR_IMAGE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(image, 0, 0, width, height);

    const compressed = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82);
    });

    if (!compressed) return await blobToDataUrl(blob);
    return await blobToDataUrl(compressed);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
