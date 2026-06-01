import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Camera } from 'lucide-react';
import { useProfileStore } from '@/store/useProfileStore';
import { Button } from '@/components/common/Button';
import { Input, Textarea } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

export function ProfilePage() {
  const { t } = useTranslation();
  const { profile, fetchProfile, saveProfile } = useProfileStore();
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [signature, setSignature] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);

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
    }
  }, [profile]);

  const onPickAvatar = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
      if (typeof selected === 'string') {
        const bytes = await readFile(selected);
        const ext = selected.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        const b64 = btoa(String.fromCharCode(...bytes));
        setAvatar(`data:${mime};base64,${b64}`);
      }
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSave = async () => {
    await saveProfile({
      nickname: nickname.trim() || undefined,
      avatar: avatar || null,
      phone: phone || null,
      email: email || null,
      signature: signature || null,
    });
    toast.success(t('profile.saved'));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold flex items-center gap-2 mb-4">
        <User size={22} />
        {t('profile.title')}
      </h1>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          {avatar ? (
            <img
              src={avatar}
              alt="avatar"
              className="w-20 h-20 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center text-2xl">
              {(nickname || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-lg font-medium">{nickname || t('profile.nickname')}</div>
            <div className="text-xs text-text-muted">{signature || '—'}</div>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onPickAvatar}>
                <Camera size={14} />
                {t('profile.uploadAvatar')}
              </Button>
              {avatar && (
                <Button size="sm" variant="danger" onClick={() => setAvatar(null)}>
                  ×
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Input
            label={t('profile.nickname')}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <Input
            label={t('profile.phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label={t('profile.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
          <Textarea
            label={t('profile.signature')}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={onSave}>{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}
