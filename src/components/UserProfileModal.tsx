import React, { useState } from 'react';
import { X, User, Plus, Check, Trash2, Edit2, Globe, Shield, Sparkles, FolderLock } from 'lucide-react';
import { LanguageCode, UserProfile } from '../types/database';
import { SUPPORTED_LANGUAGES, getLanguageMeta } from '../lib/languageHelper';
import { getWordCountForProfile } from '../lib/storage';

interface UserProfileModalProps {
  profiles: UserProfile[];
  activeProfile: UserProfile;
  onSelectProfile: (userId: string) => void;
  onCreateProfile: (name: string, targetLanguage: LanguageCode) => void;
  onUpdateProfile: (userId: string, updates: Partial<UserProfile>) => void;
  onDeleteProfile: (userId: string) => void;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  profiles,
  activeProfile,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [isManageMode, setIsManageMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLanguage, setNewLanguage] = useState<LanguageCode>('ja');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLanguage, setEditLanguage] = useState<LanguageCode>('ja');

  const handleStartCreate = () => {
    setNewName('');
    setNewLanguage('ja');
    setViewMode('create');
  };

  const handleStartEdit = (p: UserProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProfileId(p.id);
    setEditName(p.name);
    setEditLanguage(p.targetLanguage || 'en');
    setViewMode('edit');
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateProfile(newName.trim(), newLanguage);
    setViewMode('list');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileId || !editName.trim()) return;
    onUpdateProfile(editingProfileId, {
      name: editName.trim(),
      targetLanguage: editLanguage,
    });
    setViewMode('list');
  };

  const handleDelete = (p: UserProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profiles.length <= 1) {
      alert('최소 1개의 계정은 유지되어야 합니다.');
      return;
    }
    if (confirm(`'${p.name}' 계정을 삭제하시겠습니까? 해당 계정의 단어와 학습 기록이 모두 제거됩니다.`)) {
      onDeleteProfile(p.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {viewMode === 'list' && (
          <div>
            {/* Netflix-Style Header */}
            <div className="text-center mb-6 pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Multi-Profile Workspace</span>
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">
                누가 학습하고 있나요?
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                넷플릭스처럼 프로필을 선택하면 해당 계정의 고유 단어장과 망각 곡선으로 즉시 전환됩니다.
              </p>
            </div>

            {/* Netflix-Style Profile Cards Grid */}
            <div className="grid grid-cols-2 gap-3 my-5">
              {profiles.map(p => {
                const isActive = p.id === activeProfile.id;
                const langMeta = getLanguageMeta(p.targetLanguage);
                const wordCount = getWordCountForProfile(p.id);

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (!isManageMode) {
                        if (!isActive) {
                          onSelectProfile(p.id);
                        }
                        onClose();
                      }
                    }}
                    className={`relative group p-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center text-center ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-950/50'
                        : 'border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Active Ribbon Badge */}
                    {isActive && (
                      <span className="absolute -top-2 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold shadow-sm tracking-wide">
                        현재 계정
                      </span>
                    )}

                    {/* Profile Avatar Box */}
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-md mb-2.5 transition-transform group-hover:scale-105"
                      style={{ backgroundColor: p.avatarColor || '#4F46E5' }}
                    >
                      {p.name.slice(0, 1).toUpperCase()}
                    </div>

                    {/* Profile Name & Meta */}
                    <span className="font-bold text-white text-sm max-w-[130px] truncate block mb-1">
                      {p.name}
                    </span>

                    <div className="flex items-center gap-1 text-[11px] text-slate-300 font-medium">
                      <span>{langMeta.flag}</span>
                      <span>{langMeta.name}</span>
                    </div>

                    <span className="text-[10px] text-slate-400 mt-1 font-mono">
                      {wordCount}개 단어 보관 중
                    </span>

                    {/* Action buttons (always visible if manage mode or subtle hover) */}
                    <div className={`mt-3 pt-2 border-t border-slate-700/60 w-full flex items-center justify-center gap-1.5 ${isManageMode ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`}>
                      <button
                        type="button"
                        onClick={e => handleStartEdit(p, e)}
                        className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer text-[11px] flex items-center gap-0.5 font-medium"
                        title="프로필 수정"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>수정</span>
                      </button>
                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={e => handleDelete(p, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer text-[11px] flex items-center gap-0.5 font-medium"
                          title="프로필 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>삭제</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add New Profile Tile */}
              <button
                type="button"
                onClick={handleStartCreate}
                className="p-4 rounded-2xl border-2 border-dashed border-slate-700 hover:border-indigo-400 bg-slate-800/30 hover:bg-indigo-950/20 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center cursor-pointer min-h-[160px]"
              >
                <div className="w-12 h-12 rounded-2xl border border-slate-700 bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 mb-2">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-bold text-xs text-indigo-300">새 프로필 추가</span>
                <span className="text-[10px] text-slate-400 mt-0.5">독립 단어장 생성</span>
              </button>
            </div>

            {/* Profile Isolation Guarantee Notice */}
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 space-y-1 mb-3">
              <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-xs">
                <FolderLock className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>계정별 데이터 완벽 분리 보관 보증</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                각 학습자 계정마다 단어장, 폴더, 에빙하우스 망각 곡선 복습 주기, 학습 통계가 <strong>개별 파일/키로 100% 분리</strong>되어 서로 섞이지 않고 독립적으로 관리됩니다.
              </p>
            </div>
          </div>
        )}

        {viewMode === 'create' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-1">새 학습자 프로필 만들기</h2>
            <p className="text-xs text-slate-400 mb-4">
              새 계정의 이름과 학습할 목표 언어를 선택하세요. 독립된 단어장 세트가 함께 준비됩니다.
            </p>

            <form onSubmit={handleSaveCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  프로필 이름 / 닉네임
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="예: 몽태, 민수, 학생1"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  공부할 언어 선택
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_LANGUAGES.map((lang, index) => {
                    const isLast = index === SUPPORTED_LANGUAGES.length - 1;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setNewLanguage(lang.code)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isLast ? 'col-span-2' : ''
                        } ${
                          newLanguage === lang.code
                            ? 'border-indigo-500 bg-indigo-950/60 shadow-xs ring-1 ring-indigo-500 text-white'
                            : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{lang.flag}</span>
                          <span className="text-xs font-bold">{lang.name}</span>
                        </div>
                        {newLanguage === lang.code && <Check className="w-4 h-4 text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  프로필 생성하기
                </button>
              </div>
            </form>
          </div>
        )}

        {viewMode === 'edit' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-1">프로필 정보 수정</h2>
            <p className="text-xs text-slate-400 mb-4">
              학습자 이름과 주 학습 언어를 변경합니다.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  프로필 이름 / 닉네임
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="예: 몽태"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  공부할 언어 선택
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_LANGUAGES.map((lang, index) => {
                    const isLast = index === SUPPORTED_LANGUAGES.length - 1;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setEditLanguage(lang.code)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isLast ? 'col-span-2' : ''
                        } ${
                          editLanguage === lang.code
                            ? 'border-indigo-500 bg-indigo-950/60 shadow-xs ring-1 ring-indigo-500 text-white'
                            : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{lang.flag}</span>
                          <span className="text-xs font-bold">{lang.name}</span>
                        </div>
                        {editLanguage === lang.code && <Check className="w-4 h-4 text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!editName.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
