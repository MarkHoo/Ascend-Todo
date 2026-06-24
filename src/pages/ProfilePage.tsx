import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CircleAlert, IdCard, Save, User } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/common/Button';
import { Input, Textarea } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useProfileStore } from '@/store/useProfileStore';

const MAX_AVATAR_BYTES = 1024 * 1024;

export function ProfilePage() {
  const { t } = useTranslation();
  const { profile, fetchProfile, saveProfile } = useProfileStore();
  const session = useAuthStore((state) => state.session);
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [signature, setSignature] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('');
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
    ? '邮箱格式不正确'
    : '';
  const phoneError = phone.trim() && !/^[0-9+\-\s()]{6,20}$/.test(phone.trim())
    ? '手机号格式不正确'
    : '';

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
        toast.error('头像图片不能超过 1MB，建议先裁剪或压缩后再上传');
        return;
      }
      const ext = selected.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const b64 = btoa(String.fromCharCode(...bytes));
      setAvatar(`data:${mime};base64,${b64}`);
      setLastSavedText('');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSave = async () => {
    if (emailError || phoneError) {
      toast.error('请先修正表单中的错误');
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
      setLastSavedText('刚刚已保存');
      toast.success(t('profile.saved'));
    } catch (e) {
      toast.error(`个人资料保存失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setNickname(initialSnapshot.nickname);
    setPhone(initialSnapshot.phone);
    setEmail(initialSnapshot.email);
    setSignature(initialSnapshot.signature);
    setAvatar(initialSnapshot.avatar);
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
          {saving ? '保存中...' : dirty ? '有未保存修改' : lastSavedText || '资料已同步到本机'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
        <aside className="card p-6 h-fit">
          <div className="flex flex-col items-center text-center">
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-24 h-24 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-3xl">
                {(nickname || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="mt-4 text-lg font-semibold">{nickname || t('profile.nickname')}</div>
            <div className="mt-1 text-xs text-text-muted max-w-[240px] truncate">{signature || '暂无个性签名'}</div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onPickAvatar}>
                <Camera size={14} />
                {t('profile.uploadAvatar')}
              </Button>
              {avatar && (
                <Button size="sm" variant="danger" onClick={() => setAvatar(null)}>
                  移除
                </Button>
              )}
            </div>
            <div className="mt-3 text-xs text-text-muted leading-5">
              建议使用 1MB 以内的方形图片。后续可升级为裁剪并存储到应用数据目录。
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <section className="card p-5">
            <div className="text-sm font-semibold flex items-center gap-2 mb-4">
              <IdCard size={16} />
              本机显示身份
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={t('profile.nickname')} value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <Input
                label={t('profile.phone')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={phoneError}
                hint="仅作为本机资料字段，不会自动公开。"
              />
              <Input
                label={t('profile.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                error={emailError}
                hint="仅作为本机资料字段，不会自动公开。"
              />
              <div className="sm:col-span-2">
                <Textarea
                  label={t('profile.signature')}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  maxLength={120}
                  placeholder="写一句给自己看的状态或目标"
                />
                <div className="text-xs text-text-muted mt-1 text-right">{signature.length}/120</div>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <div className="text-sm font-semibold flex items-center gap-2 mb-3">
              <CircleAlert size={16} />
              账号关系
            </div>
            <div className="text-sm text-text-muted leading-6">
              {session ? (
                <>
                  当前登录账号：<span className="text-text font-medium">{session.nickname}</span>。
                  个人资料用于本机侧边栏和本机展示，账号信息用于登录和同步，两者可以不同。
                </>
              ) : (
                '当前未登录。个人资料仍会保存在本机，用于侧边栏和本机展示。'
              )}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>取消修改</Button>
            <Button onClick={onSave} disabled={!dirty || saving}>
              <Save size={15} />
              {saving ? '保存中' : t('common.save')}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
