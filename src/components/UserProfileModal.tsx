import React, { useState } from 'react';
import { Check, ChevronLeft, Pencil, Plus } from 'lucide-react';
import { LanguageCode, UserProfile } from '../types/database';
import { SUPPORTED_LANGUAGES, getLanguageMeta } from '../lib/languageHelper';
import { getWordCountForProfile } from '../lib/storage';
import { Button, Field, Sheet, inputClass } from './ui';

interface UserProfileModalProps {
  profiles: UserProfile[];
  activeProfile: UserProfile;
  onSelectProfile: (id: string) => void;
  onCreateProfile: (name: string, lang: LanguageCode) => void;
  onUpdateProfile: (id: string, updates: Partial<UserProfile>) => void;
  onDeleteProfile: (id: string) => void;
  onClose: () => void;
}

export const LanguagePicker: React.FC<{ value: LanguageCode; onChange: (l: LanguageCode) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-2">
    {SUPPORTED_LANGUAGES.map(l => (
      <button
        key={l.code}
        type="button"
        onClick={() => onChange(l.code)}
        className={`h-11 rounded-xl border text-[14px] ${
          value === l.code ? 'border-accent bg-accent-soft text-ink font-semibold' : 'border-line bg-surface text-ink-2'
        }`}
      >
        {l.name}
      </button>
    ))}
  </div>
);

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  profiles,
  activeProfile,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onClose,
}) => {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [lang, setLang] = useState<LanguageCode>('en');

  const openEdit = (p: UserProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setLang(p.targetLanguage);
    setMode('edit');
  };

  if (mode !== 'list') {
    const editing = profiles.find(p => p.id === editingId);
    return (
      <Sheet
        title={mode === 'create' ? '새 학습자' : '학습자 정보'}
        onClose={onClose}
        footer={
          <Button
            variant="primary"
            block
            disabled={!name.trim()}
            onClick={() => {
              if (mode === 'create') onCreateProfile(name, lang);
              else if (editingId) {
                onUpdateProfile(editingId, { name: name.trim(), targetLanguage: lang });
                setMode('list');
              }
            }}
          >
            {mode === 'create' ? '만들기' : '저장'}
          </Button>
        }
      >
        <button onClick={() => setMode('list')} className="inline-flex items-center gap-1 text-sm text-muted mb-4">
          <ChevronLeft className="w-4 h-4" /> 목록
        </button>
        <div className="space-y-5">
          <Field label="이름">
            <input autoFocus className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="예: 태균, 동생" />
          </Field>
          <Field label="배우는 언어">
            <LanguagePicker value={lang} onChange={setLang} />
          </Field>
          {mode === 'create' && (
            <p className="text-[13px] text-muted">학습자마다 단어장과 복습 기록이 따로 저장됩니다. 가족이나 언어별로 나눠 쓰세요.</p>
          )}
          {mode === 'edit' && editing && profiles.length > 1 && (
            <button
              className="text-sm text-bad"
              onClick={() => {
                if (confirm(`'${editing.name}'을(를) 삭제할까요? 이 학습자의 단어와 기록이 모두 지워집니다.`)) {
                  onDeleteProfile(editing.id);
                  setMode('list');
                }
              }}
            >
              이 학습자 삭제
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="학습자" onClose={onClose}>
      <ul className="divide-y divide-line -mx-1">
        {profiles.map(p => {
          const active = p.id === activeProfile.id;
          return (
            <li key={p.id} className="flex items-center gap-2">
              <button onClick={() => onSelectProfile(p.id)} className="flex-1 flex items-center gap-3 px-1 py-3 text-left">
                <span className="w-10 h-10 rounded-full bg-accent-soft text-accent font-bold flex items-center justify-center shrink-0">
                  {p.name.slice(0, 1)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{p.name}</span>
                  <span className="block text-[13px] text-muted">
                    {getLanguageMeta(p.targetLanguage).name} · {getWordCountForProfile(p.id)}단어
                  </span>
                </span>
                {active && <Check className="w-5 h-5 text-accent" />}
              </button>
              <button onClick={() => openEdit(p)} className="p-2 text-muted rounded-full hover:bg-sunken" aria-label={`${p.name} 수정`}>
                <Pencil className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        block
        className="mt-4"
        onClick={() => {
          setName('');
          setLang(activeProfile.targetLanguage);
          setMode('create');
        }}
      >
        <Plus className="w-4 h-4" /> 학습자 추가
      </Button>
    </Sheet>
  );
};
