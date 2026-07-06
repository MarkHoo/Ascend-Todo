import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, CircleAlert, Cloud, IdCard, LogOut, RefreshCw, Save, ShieldCheck, User, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { authApi, settingsApi, syncApi } from '@/api';
import type { CloudDevice } from '@/api/auth';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useProfileStore } from '@/store/useProfileStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { dayjs } from '@/utils/date';
import type { Snapshot, SyncStatus } from '@/types';

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

const cloudCopy = {
  'zh-CN': {
    title: '账号与同步',
    subtitle: '登录账号后可在多设备之间同步任务、目标、设置和日历数据。头像仍只保存在本机。',
    syncEnabled: '启用云端同步',
    login: '登录',
    register: '注册',
    email: '账号邮箱',
    password: '密码',
    loggedInAs: '已登录：{{name}}',
    verified: '邮箱已验证',
    unverified: '邮箱未验证',
    verificationCode: '邮箱验证码',
    sendCode: '发送验证码',
    verifyEmail: '验证邮箱',
    logout: '退出登录',
    syncActions: '数据同步',
    uploadLocal: '上传本机数据',
    restoreCloud: '从云端恢复',
    smartMerge: '智能合并',
    devices: '登录设备',
    refresh: '刷新',
    currentDevice: '当前设备',
    rename: '重命名',
    remove: '移除',
    removeOthers: '移除其他设备',
    requestWipe: '请求清理',
    emptyDevices: '暂无设备记录',
    remoteVersion: '云端版本：{{version}}',
    lastSync: '上次同步：{{time}}',
    verifyRequired: '验证邮箱后才可以同步',
    enterAccount: '请输入邮箱和密码',
    loginSuccess: '登录成功',
    registerSuccess: '注册成功',
    codeSent: '验证码已发送',
    emailVerified: '邮箱已验证',
    loggedOut: '已退出登录',
    pushSuccess: '本机数据已上传',
    pullSuccess: '云端数据已恢复到本机',
    mergeSuccess: '数据已合并并上传',
    syncFailed: '同步失败：{{msg}}',
    deviceRenamed: '设备已重命名',
    deviceRemoved: '设备已移除',
    wipeRequested: '已请求清理',
    othersRemoved: '其他设备已移除',
  },
  'zh-TW': {
    title: '帳號與同步',
    subtitle: '登入帳號後可在多裝置之間同步任務、目標、設定和日曆資料。頭像仍只保存在本機。',
    syncEnabled: '啟用雲端同步',
    login: '登入',
    register: '註冊',
    email: '帳號信箱',
    password: '密碼',
    loggedInAs: '已登入：{{name}}',
    verified: '信箱已驗證',
    unverified: '信箱未驗證',
    verificationCode: '信箱驗證碼',
    sendCode: '傳送驗證碼',
    verifyEmail: '驗證信箱',
    logout: '登出',
    syncActions: '資料同步',
    uploadLocal: '上傳本機資料',
    restoreCloud: '從雲端還原',
    smartMerge: '智慧合併',
    devices: '登入裝置',
    refresh: '重新整理',
    currentDevice: '目前裝置',
    rename: '重新命名',
    remove: '移除',
    removeOthers: '移除其他裝置',
    requestWipe: '請求清理',
    emptyDevices: '暫無裝置記錄',
    remoteVersion: '雲端版本：{{version}}',
    lastSync: '上次同步：{{time}}',
    verifyRequired: '驗證信箱後才可以同步',
    enterAccount: '請輸入信箱和密碼',
    loginSuccess: '登入成功',
    registerSuccess: '註冊成功',
    codeSent: '驗證碼已傳送',
    emailVerified: '信箱已驗證',
    loggedOut: '已登出',
    pushSuccess: '本機資料已上傳',
    pullSuccess: '雲端資料已還原到本機',
    mergeSuccess: '資料已合併並上傳',
    syncFailed: '同步失敗：{{msg}}',
    deviceRenamed: '裝置已重新命名',
    deviceRemoved: '裝置已移除',
    wipeRequested: '已請求清理',
    othersRemoved: '其他裝置已移除',
  },
  en: {
    title: 'Account & Sync',
    subtitle: 'Sign in to sync tasks, goals, settings, and calendar data across devices. Avatar stays local.',
    syncEnabled: 'Enable cloud sync',
    login: 'Log in',
    register: 'Register',
    email: 'Account email',
    password: 'Password',
    loggedInAs: 'Signed in: {{name}}',
    verified: 'Email verified',
    unverified: 'Email not verified',
    verificationCode: 'Email code',
    sendCode: 'Send code',
    verifyEmail: 'Verify email',
    logout: 'Log out',
    syncActions: 'Data sync',
    uploadLocal: 'Upload local data',
    restoreCloud: 'Restore from cloud',
    smartMerge: 'Smart merge',
    devices: 'Signed-in devices',
    refresh: 'Refresh',
    currentDevice: 'Current device',
    rename: 'Rename',
    remove: 'Remove',
    removeOthers: 'Remove other devices',
    requestWipe: 'Request cleanup',
    emptyDevices: 'No device records',
    remoteVersion: 'Cloud version: {{version}}',
    lastSync: 'Last sync: {{time}}',
    verifyRequired: 'Verify your email before syncing',
    enterAccount: 'Enter email and password',
    loginSuccess: 'Signed in',
    registerSuccess: 'Registered',
    codeSent: 'Verification code sent',
    emailVerified: 'Email verified',
    loggedOut: 'Signed out',
    pushSuccess: 'Local data uploaded',
    pullSuccess: 'Cloud data restored locally',
    mergeSuccess: 'Data merged and uploaded',
    syncFailed: 'Sync failed: {{msg}}',
    deviceRenamed: 'Device renamed',
    deviceRemoved: 'Device removed',
    wipeRequested: 'Cleanup requested',
    othersRemoved: 'Other devices removed',
  },
} as const;

export function ProfilePage() {
  const { t } = useTranslation();
  const { settings, setSettings, setAll } = useSettingsStore();
  const language = settings.language;
  const copy = profileCopy[language];
  const cloudText = cloudCopy[language];
  const { profile, fetchProfile, saveProfile } = useProfileStore();
  const { session, setSession } = useAuthStore();
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [cloudDevices, setCloudDevices] = useState<CloudDevice[]>([]);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [cloudBusy, setCloudBusy] = useState(false);
  const hydratedRef = useRef(false);

  const nicknameTooLong = language === 'en'
    ? 'Nickname can be up to 16 characters'
    : language === 'zh-TW'
      ? '暱稱最多 16 個字'
      : '昵称最多 16 个字';

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    (async () => {
      try {
        const [status, currentSession] = await Promise.all([
          syncApi.status().catch(() => null),
          authApi.current().catch(() => null),
        ]);
        if (status) setSyncStatus(status);
        if (currentSession) {
          setSession(currentSession);
          setCloudDevices(await authApi.listDevices().catch(() => []));
        }
      } catch {
        /* Cloud account is optional. */
      }
    })();
  }, [setSession]);

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
      const nextNickname = patch.nickname ?? (nickname.trim() || undefined);
      const nextSignature = patch.signature !== undefined ? patch.signature : signature.trim() || null;
      await saveProfile({
        nickname: nextNickname,
        avatar: avatar || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        signature: nextSignature,
      });
      if (patch.nickname !== undefined) {
        setNickname(patch.nickname);
        setNicknameDraft(patch.nickname);
      }
      if (patch.signature !== undefined) {
        setSignature(patch.signature || '');
        setSignatureDraft(patch.signature || '');
      }
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
    if (Array.from(next).length > 16) {
      toast.error(nicknameTooLong);
      return;
    }
    await saveInlineProfile({ nickname: next });
    setEditingNickname(false);
  };

  const cancelNickname = () => {
    setNicknameDraft(nickname);
    setEditingNickname(false);
  };

  const saveSignature = async () => {
    const next = signatureDraft.trim();
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

  const saveSettingsPatch = async (patch: Partial<typeof settings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(patch);
    try {
      await settingsApi.save(next);
      if (patch.syncEnabled !== undefined) {
        setSyncStatus(await syncApi.status().catch(() => syncStatus));
      }
    } catch (error) {
      setAll(previous);
      toast.error(String(error));
    }
  };

  const refreshCloudDevices = async () => {
    const devices = await authApi.listDevices().catch(() => []);
    setCloudDevices(devices);
    await handleCurrentDeviceWipeRequest(devices);
  };

  const refreshCloudStatus = async () => {
    const [status, devices] = await Promise.all([
      syncApi.status().catch(() => null),
      authApi.listDevices().catch(() => []),
    ]);
    if (status) setSyncStatus(status);
    setCloudDevices(devices);
    await handleCurrentDeviceWipeRequest(devices);
  };

  const saveSafetyBackup = async (reason: string) => {
    const backup = await syncApi.exportBackup();
    localStorage.setItem('ascend:lastSafetyBackup', backup);
    localStorage.setItem('ascend:lastSafetyBackupReason', reason);
    localStorage.setItem('ascend:lastSafetyBackupAt', new Date().toISOString());
  };

  const handleCurrentDeviceWipeRequest = async (devices: CloudDevice[]) => {
    const current = devices.find((device) => device.id === session?.deviceId);
    if (!current?.wipeRequestedAt) return;
    const confirmed = window.confirm(
      language === 'en'
        ? 'This device has been marked for local cleanup from another signed-in device. Clear local data now?'
        : language === 'zh-TW'
          ? '這台裝置已被其他登入裝置標記為需要清理本機資料。現在清理本機資料嗎？'
          : '这台设备已被其他登录设备标记为需要清理本机数据。现在清理本机数据吗？',
    );
    if (!confirmed) return;
    await saveSafetyBackup('remote-wipe-request');
    await authApi.markDeviceWiped(current.id).catch(() => undefined);
    await syncApi.clearLocalData();
    setSession(null);
    setCloudDevices([]);
    setSyncStatus(await syncApi.status().catch(() => null));
    toast.info(language === 'en' ? 'Local data cleared' : language === 'zh-TW' ? '本機資料已清理' : '本机数据已清理');
  };

  const handlePostLoginSyncChoice = async (nextSession = session) => {
    const [snapshot, status] = await Promise.all([
      syncApi.snapshot().catch(() => null),
      syncApi.status().catch(() => null),
    ]);
    const localHasData = snapshot ? snapshotHasUserData(snapshot) : false;
    const cloudHasData = Boolean(status?.remoteVersion && status.remoteVersion > 0);

    if (status) setSyncStatus(status);
    if (!settings.syncEnabled || !nextSession?.emailVerified) return;

    if (!localHasData && cloudHasData) {
      await saveSafetyBackup('auto-pull-cloud-data');
      await syncApi.pull();
      toast.success(cloudText.pullSuccess);
      return;
    }

    if (localHasData && !cloudHasData) {
      if (window.confirm(language === 'en'
        ? 'This device has local data, and the cloud is empty. Upload local data to the cloud now?'
        : language === 'zh-TW'
          ? '這台裝置有本機資料，雲端目前是空的。現在上傳本機資料到雲端嗎？'
          : '这台设备有本机数据，云端目前是空的。现在上传本机数据到云端吗？')) {
        await syncApi.push();
        toast.success(cloudText.pushSuccess);
      }
      return;
    }

    if (localHasData && cloudHasData) {
      const choice = window.prompt(
        language === 'en'
          ? 'Both local and cloud data exist. Enter 1 to merge, 2 to upload local over cloud, 3 to restore cloud over local, or leave blank to keep local only for now.'
          : language === 'zh-TW'
            ? '本機和雲端都有資料。輸入 1 合併，2 用本機覆蓋雲端，3 用雲端覆蓋本機，留空暫時只保留本機。'
            : '本机和云端都有数据。输入 1 合并，2 用本机覆盖云端，3 用云端覆盖本机，留空暂时只保留本机。',
      )?.trim();
      if (!choice) return;
      await saveSafetyBackup(`sync-choice-${choice}`);
      if (choice === '1') {
        await syncApi.merge();
        toast.success(cloudText.mergeSuccess);
      } else if (choice === '2' && window.confirm(language === 'en' ? 'Confirm overwriting cloud data with this device?' : language === 'zh-TW' ? '確認用這台裝置覆蓋雲端資料？' : '确认用这台设备覆盖云端数据？')) {
        await syncApi.push();
        toast.success(cloudText.pushSuccess);
      } else if (choice === '3' && window.confirm(language === 'en' ? 'Confirm overwriting local data with cloud data?' : language === 'zh-TW' ? '確認用雲端資料覆蓋本機資料？' : '确认用云端数据覆盖本机数据？')) {
        await syncApi.pull();
        toast.success(cloudText.pullSuccess);
      }
    }
  };

  const onCloudAuth = async () => {
    if (!cloudEmail.trim() || !cloudPassword) {
      toast.error(cloudText.enterAccount);
      return;
    }
    setCloudBusy(true);
    try {
      const nextSession = authMode === 'login'
        ? await authApi.login({ email: cloudEmail.trim(), password: cloudPassword })
        : await authApi.register({ email: cloudEmail.trim(), password: cloudPassword });
      setSession(nextSession);
      setCloudPassword('');
      await refreshCloudStatus();
      window.setTimeout(() => {
        void handlePostLoginSyncChoice(nextSession).catch((error) => toast.error(String(error)));
      }, 0);
      toast.success(authMode === 'login' ? cloudText.loginSuccess : cloudText.registerSuccess);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onSendEmailCode = async () => {
    setCloudBusy(true);
    try {
      await authApi.sendEmailVerificationCode();
      toast.success(cloudText.codeSent);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onVerifyEmail = async () => {
    if (!verificationCode.trim()) return;
    setCloudBusy(true);
    try {
      const nextSession = await authApi.verifyEmailCode(verificationCode.trim());
      setSession(nextSession);
      setVerificationCode('');
      await refreshCloudStatus();
      toast.success(cloudText.emailVerified);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onLogout = async () => {
    const logoutChoice = window.prompt(
      language === 'en'
        ? 'Log out options: 1 sync then log out, 2 log out and keep local data, 3 log out and clear this device data. Leave blank to cancel.'
        : language === 'zh-TW'
          ? '退出選項：1 同步後退出，2 退出並保留本機資料，3 退出並清理這台裝置資料。留空取消。'
          : '退出选项：1 同步后退出，2 退出并保留本机数据，3 退出并清理这台设备数据。留空取消。',
    )?.trim();
    if (!logoutChoice) return;
    setCloudBusy(true);
    try {
      if (logoutChoice === '1') {
        await syncApi.merge();
      } else if (logoutChoice === '3') {
        const confirmText = language === 'en' ? 'CLEAR' : '清理';
        const typed = window.prompt(
          language === 'en'
            ? 'This will clear all local data on this device after backup. Type CLEAR to continue.'
            : language === 'zh-TW'
              ? '這會在備份後清理這台裝置的所有本機資料。輸入「清理」繼續。'
              : '这会在备份后清理这台设备的所有本机数据。输入“清理”继续。',
        );
        if (typed !== confirmText) return;
        await saveSafetyBackup('logout-clear-local-data');
        await syncApi.clearLocalData();
      }
      await authApi.logout();
      setSession(null);
      setCloudDevices([]);
      setSyncStatus(await syncApi.status().catch(() => null));
      toast.info(cloudText.loggedOut);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onSync = async (action: 'push' | 'pull' | 'merge') => {
    setCloudBusy(true);
    try {
      if (action === 'push') {
        await syncApi.push();
        toast.success(cloudText.pushSuccess);
      } else if (action === 'pull') {
        await syncApi.pull();
        toast.success(cloudText.pullSuccess);
      } else {
        await syncApi.merge();
        toast.success(cloudText.mergeSuccess);
      }
      await refreshCloudStatus();
    } catch (error) {
      toast.error(cloudText.syncFailed.replace('{{msg}}', String(error)));
    } finally {
      setCloudBusy(false);
    }
  };

  const onRenameCloudDevice = async (device: CloudDevice) => {
    const nextName = window.prompt(cloudText.rename, device.deviceName);
    if (!nextName?.trim() || nextName.trim() === device.deviceName) return;
    setCloudBusy(true);
    try {
      await authApi.renameDevice(device.id, nextName.trim());
      await refreshCloudDevices();
      toast.success(cloudText.deviceRenamed);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onRevokeCloudDevice = async (device: CloudDevice) => {
    if (device.id === session?.deviceId) return;
    if (!window.confirm(`${cloudText.remove}: ${device.deviceName}?`)) return;
    setCloudBusy(true);
    try {
      await authApi.revokeDevice(device.id);
      await refreshCloudDevices();
      toast.success(cloudText.deviceRemoved);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onRequestCloudDeviceWipe = async (device: CloudDevice) => {
    if (device.id === session?.deviceId) return;
    if (!window.confirm(`${cloudText.requestWipe}: ${device.deviceName}?`)) return;
    setCloudBusy(true);
    try {
      await authApi.requestDeviceWipe(device.id);
      await refreshCloudDevices();
      toast.success(cloudText.wipeRequested);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const onRevokeOtherCloudDevices = async () => {
    if (!window.confirm(cloudText.removeOthers)) return;
    setCloudBusy(true);
    try {
      await authApi.revokeOtherDevices();
      await refreshCloudDevices();
      toast.success(cloudText.othersRemoved);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCloudBusy(false);
    }
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

      <div className="space-y-4">
        <section className="px-4 py-3">
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
            <div className="mt-4 w-full max-w-[320px]">
              {editingNickname ? (
                <div className="flex items-center gap-1.5">
                  <input
                    className="input h-9 min-w-0 flex-1 text-center text-base font-semibold"
                    value={nicknameDraft}
                    maxLength={16}
                    autoFocus
                    onChange={(event) => setNicknameDraft(Array.from(event.target.value).slice(0, 16).join(''))}
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
            <div className="mt-1 w-full max-w-[360px]">
              {editingSignature ? (
                <div className="relative flex items-start gap-1.5">
                  <textarea
                    className="input min-h-[72px] min-w-0 flex-1 resize-none text-sm"
                    value={signatureDraft}
                    maxLength={30}
                    autoFocus
                    placeholder={copy.signaturePlaceholder}
                    onChange={(event) => setSignatureDraft(event.target.value.slice(0, 30))}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') cancelSignature();
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) saveSignature();
                    }}
                  />
                  <span className="pointer-events-none absolute bottom-2 right-12 text-[10px] text-text-muted">
                    {30 - signatureDraft.length}
                  </span>
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
        </section>

        <main className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

          <section className="card p-5 lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Cloud size={16} />
                  {cloudText.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">{cloudText.subtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium">{cloudText.syncEnabled}</span>
                <ProfileToggle value={settings.syncEnabled} onChange={(value) => saveSettingsPatch({ syncEnabled: value })} />
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              {session ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">
                      {cloudText.loggedInAs.replace('{{name}}', session.email || session.nickname)}
                    </span>
                    <span className={`chip ${session.emailVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {session.emailVerified ? cloudText.verified : cloudText.unverified}
                    </span>
                    <Button size="sm" variant="outline" onClick={onLogout} disabled={cloudBusy}>
                      <LogOut size={14} />
                      {cloudText.logout}
                    </Button>
                  </div>

                  {!session.emailVerified && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700">
                        <ShieldCheck size={15} />
                        {cloudText.verifyRequired}
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <Input
                          label={cloudText.verificationCode}
                          value={verificationCode}
                          onChange={(event) => setVerificationCode(event.target.value)}
                          className="w-44"
                        />
                        <Button size="sm" variant="outline" onClick={onSendEmailCode} disabled={cloudBusy}>
                          {cloudText.sendCode}
                        </Button>
                        <Button size="sm" onClick={onVerifyEmail} disabled={cloudBusy || !verificationCode.trim()}>
                          {cloudText.verifyEmail}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-surface-subtle p-3">
                    <div className="mb-3 text-sm font-semibold">{cloudText.syncActions}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => onSync('push')} disabled={cloudBusy || !settings.syncEnabled || !session.emailVerified}>
                        {cloudText.uploadLocal}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onSync('pull')} disabled={cloudBusy || !settings.syncEnabled || !session.emailVerified}>
                        {cloudText.restoreCloud}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onSync('merge')} disabled={cloudBusy || !settings.syncEnabled || !session.emailVerified}>
                        {cloudText.smartMerge}
                      </Button>
                      {syncStatus?.remoteVersion && (
                        <span className="text-xs text-text-muted">
                          {cloudText.remoteVersion.replace('{{version}}', String(syncStatus.remoteVersion))}
                        </span>
                      )}
                      {syncStatus?.lastPushedAt && (
                        <span className="text-xs text-text-muted">
                          {cloudText.lastSync.replace('{{time}}', dayjs(syncStatus.lastPushedAt).format('YYYY-MM-DD HH:mm'))}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-subtle p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{cloudText.devices}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={refreshCloudStatus} disabled={cloudBusy} title={cloudText.refresh}>
                          <RefreshCw size={14} />
                        </Button>
                        <Button size="sm" variant="danger" onClick={onRevokeOtherCloudDevices} disabled={cloudBusy || cloudDevices.length <= 1}>
                          {cloudText.removeOthers}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {cloudDevices.length === 0 ? (
                        <div className="text-xs text-text-muted">{cloudText.emptyDevices}</div>
                      ) : cloudDevices.map((device) => (
                        <div key={device.id} className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 font-medium">
                              <span className="truncate">{device.deviceName}</span>
                              {device.id === session.deviceId && (
                                <span className="ml-2 text-xs text-primary">{cloudText.currentDevice}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" onClick={() => onRenameCloudDevice(device)} disabled={cloudBusy}>
                                {cloudText.rename}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRequestCloudDeviceWipe(device)}
                                disabled={cloudBusy || device.id === session.deviceId || Boolean(device.wipeRequestedAt)}
                              >
                                {cloudText.requestWipe}
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => onRevokeCloudDevice(device)} disabled={cloudBusy || device.id === session.deviceId}>
                                {cloudText.remove}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {[device.platform, device.appVersion].filter(Boolean).join(' / ') || '-'}
                            {device.lastSyncAt ? ` / ${dayjs(device.lastSyncAt).format('YYYY-MM-DD HH:mm')}` : ''}
                            {device.revokedAt ? ` / ${cloudText.remove}` : ''}
                            {device.wipeRequestedAt ? ` / ${cloudText.requestWipe}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <ProfileSegmented>
                    <ProfileSegmentButton active={authMode === 'login'} onClick={() => setAuthMode('login')}>
                      {cloudText.login}
                    </ProfileSegmentButton>
                    <ProfileSegmentButton active={authMode === 'register'} onClick={() => setAuthMode('register')}>
                      {cloudText.register}
                    </ProfileSegmentButton>
                  </ProfileSegmented>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label={cloudText.email} type="email" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} />
                    <Input label={cloudText.password} type="password" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} />
                  </div>
                  <Button onClick={onCloudAuth} disabled={cloudBusy}>
                    {authMode === 'login' ? cloudText.login : cloudText.register}
                  </Button>
                </div>
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

function ProfileToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative h-6 w-11 rounded-full transition-colors"
      style={{ background: value ? 'var(--primary)' : 'var(--surface-2)' }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
        style={{ left: value ? '22px' : '2px' }}
      />
    </button>
  );
}

function ProfileSegmented({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-surface-subtle p-0.5 text-sm">
      {children}
    </div>
  );
}

function ProfileSegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 transition-colors ${
        active ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface hover:text-text'
      }`}
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

function snapshotHasUserData(snapshot: Snapshot) {
  const total =
    snapshot.boards.length +
    snapshot.lists.length +
    snapshot.tasks.length +
    snapshot.goals.length +
    snapshot.keyResults.length +
    snapshot.progressLogs.length +
    snapshot.milestones.length +
    snapshot.pomodoroSessions.length +
    snapshot.checkIns.length +
    snapshot.reviewReports.length +
    snapshot.calendarEvents.length +
    snapshot.calendarHolidaySources.length +
    snapshot.calendarEmailAccounts.length +
    snapshot.holidaySyncConfigs.length;
  const profileHasData = Boolean(
    snapshot.userProfile?.nickname ||
    snapshot.userProfile?.phone ||
    snapshot.userProfile?.email ||
    snapshot.userProfile?.signature,
  );
  return total > 0 || profileHasData;
}
