import React, { useState, useRef } from 'react';
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  BookOpen,
  Volume2,
  Sparkles,
  FolderPlus,
  Edit2,
  Trash2,
  Folder,
  FolderOpen,
  Wrench,
  CheckCircle2,
  CheckSquare,
  Check,
  X,
} from 'lucide-react';
import {
  MemoryState,
  MemoryStatus,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from '../types/database';
import { speakEnglishWord } from '../lib/sound';
import { cleanAndRepairVocabulary } from '../lib/storage';
import { getLanguageMeta, isRTL } from '../lib/languageHelper';
import { WordDetailModal } from './WordDetailModal';
import { AddWordModal } from './AddWordModal';

interface VocabLibraryProps {
  items: VocabularyItem[];
  collections: VocabularyCollection[];
  folders: VocabularyFolder[];
  memoryStateMap: Map<string, MemoryState>;
  selectedCollectionId?: string;
  onUpdateItem: (item: VocabularyItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteItems?: (ids: string[]) => void;
  onMoveItemsToFolder?: (ids: string[], folderId?: string) => void;
  onAddItem: (item: VocabularyItem) => void;
  onCreateCollection: (collection: VocabularyCollection) => void;
  onDeleteCollection: (id: string) => void;
  onCreateFolder: (folder: VocabularyFolder) => void;
  onDeleteFolder: (id: string) => void;
  onReloadData?: () => void;
}

export const VocabLibrary: React.FC<VocabLibraryProps> = ({
  items,
  collections,
  folders,
  memoryStateMap,
  selectedCollectionId: initialCollectionId,
  onUpdateItem,
  onDeleteItem,
  onDeleteItems,
  onMoveItemsToFolder,
  onAddItem,
  onCreateCollection,
  onDeleteCollection,
  onCreateFolder,
  onDeleteFolder,
  onReloadData,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(
    initialCollectionId || 'all'
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingItem, setInspectingItem] = useState<VocabularyItem | null>(null);
  const [showAddWordModal, setShowAddWordModal] = useState(false);
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCollectionId, setNewFolderCollectionId] = useState<string>('');
  const [repairNotice, setRepairNotice] = useState<string | null>(null);

  // Batch selection state (long press & multi-management)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBatchMoveModal, setShowBatchMoveModal] = useState(false);
  const [batchTargetFolderId, setBatchTargetFolderId] = useState<string>('none');

  // Long press timer references
  const longPressTimerRef = useRef<{ [key: string]: any }>({});
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleRepairWords = () => {
    const res = cleanAndRepairVocabulary();
    if (onReloadData) {
      onReloadData();
    }
    setRepairNotice(
      `🛠️ 단어 정리 완료: ${res.repairedCount}개 단어의 뒤틀린 서식/반대 표기가 복구되었고, ${res.removedCount}개의 무효/중복 항목이 정리되었습니다.`
    );
    setTimeout(() => {
      setRepairNotice(null);
    }, 5000);
  };

  // Available folders for current collection view
  const currentFolders = selectedCollectionId === 'all'
    ? folders
    : folders.filter(f => f.collectionId === selectedCollectionId);

  // Filter items
  const filteredItems = items.filter(item => {
    // Collection filter
    if (selectedCollectionId !== 'all' && item.collectionId !== selectedCollectionId) {
      return false;
    }

    // Folder filter
    if (selectedFolderId !== 'all' && item.folderId !== selectedFolderId) {
      return false;
    }

    const state = memoryStateMap.get(item.id);
    const status = state?.status || 'new';

    // Status filter
    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const termMatch = item.term.toLowerCase().includes(q);
      const meaningMatch = item.userMeaning.toLowerCase().includes(q);
      const aiMatch = item.aiSuggestedMeaning?.toLowerCase().includes(q);
      if (!termMatch && !meaningMatch && !aiMatch) {
        return false;
      }
    }

    return true;
  });

  const isAllSelected =
    filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.has(i.id));

  // Toggle item selection
  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all or deselect all
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  // Long press event handlers
  const handleItemTouchStart = (itemId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current[itemId] = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(40);
      setIsSelectionMode(true);
      setSelectedItemIds(prev => new Set(prev).add(itemId));
    }, 450);
  };

  const handleItemTouchMove = (itemId: string, e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 8 || dy > 8) {
      if (longPressTimerRef.current[itemId]) {
        clearTimeout(longPressTimerRef.current[itemId]);
        delete longPressTimerRef.current[itemId];
      }
    }
  };

  const handleItemTouchEnd = (itemId: string) => {
    if (longPressTimerRef.current[itemId]) {
      clearTimeout(longPressTimerRef.current[itemId]);
      delete longPressTimerRef.current[itemId];
    }
  };

  const handleItemMouseDown = (itemId: string) => {
    longPressTimerRef.current[itemId] = setTimeout(() => {
      setIsSelectionMode(true);
      setSelectedItemIds(prev => new Set(prev).add(itemId));
    }, 450);
  };

  const handleItemMouseUp = (itemId: string) => {
    if (longPressTimerRef.current[itemId]) {
      clearTimeout(longPressTimerRef.current[itemId]);
      delete longPressTimerRef.current[itemId];
    }
  };

  // Batch delete selected words
  const handleBatchDelete = () => {
    if (selectedItemIds.size === 0) return;
    const count = selectedItemIds.size;
    if (confirm(`선택한 ${count}개 단어를 정말 삭제하시겠습니까?`)) {
      if (onDeleteItems) {
        onDeleteItems(Array.from(selectedItemIds));
      } else {
        selectedItemIds.forEach(id => onDeleteItem(id));
      }
      setSelectedItemIds(new Set());
      setIsSelectionMode(false);
      if (onReloadData) onReloadData();
    }
  };

  // Batch move to folder
  const handleBatchMoveConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItemIds.size === 0) return;
    const targetFld = batchTargetFolderId === 'none' ? undefined : batchTargetFolderId;
    if (onMoveItemsToFolder) {
      onMoveItemsToFolder(Array.from(selectedItemIds), targetFld);
    }
    setSelectedItemIds(new Set());
    setIsSelectionMode(false);
    setShowBatchMoveModal(false);
    if (onReloadData) onReloadData();
  };

  const getStatusBadge = (status: MemoryStatus) => {
    switch (status) {
      case 'mastered':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">장기 기억</span>;
      case 'retaining':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">기억 중</span>;
      case 'learning':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">학습 중</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">새 단어</span>;
    }
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;

    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newCol: VocabularyCollection = {
      id: `col_${Date.now()}`,
      name: newCollectionName.trim(),
      sourceLanguage: 'en',
      targetLanguage: 'ko',
      color: randomColor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onCreateCollection(newCol);
    setSelectedCollectionId(newCol.id);
    setNewCollectionName('');
    setShowCreateCollectionModal(false);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const targetColId =
      newFolderCollectionId ||
      (selectedCollectionId !== 'all' ? selectedCollectionId : collections[0]?.id);
    if (!targetColId) return;

    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newFld: VocabularyFolder = {
      id: `folder_${Date.now()}`,
      collectionId: targetColId,
      name: newFolderName.trim(),
      color: randomColor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onCreateFolder(newFld);
    setSelectedFolderId(newFld.id);
    setNewFolderName('');
    setShowCreateFolderModal(false);
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto animate-in fade-in duration-300">
      {/* Top Header & Actions */}
      <div className="flex flex-col items-center justify-center text-center mb-5 gap-3">
        <div className="flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 text-center">단어장</h1>
          <p className="text-xs text-slate-600 mt-1.5 text-center font-medium inline-flex items-center justify-center gap-1.5 px-3.5 py-1 bg-white border border-slate-200/90 rounded-full shadow-xs">
            <span>총</span>
            <strong className="text-indigo-600 font-bold">{items.length}개</strong>
            <span>어휘 보관 중</span>
          </p>
        </div>

        <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
          {/* Select Mode Toggle */}
          <button
            onClick={() => {
              setIsSelectionMode(prev => !prev);
              if (isSelectionMode) setSelectedItemIds(new Set());
            }}
            className={`p-2 rounded-xl border transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer active:scale-95 ${
              isSelectionMode
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'
            }`}
            title="길게 누르거나 클릭하여 단어 다중 선택 및 관리"
          >
            <CheckSquare className="w-4 h-4" />
            <span className="hidden sm:inline">{isSelectionMode ? '선택 취소' : '선택 관리'}</span>
          </button>

          <button
            onClick={handleRepairWords}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 active:scale-95 flex items-center gap-1 text-xs font-semibold cursor-pointer bg-white"
            title="뒤틀리거나 잘못 들어간 단어 자동 복구 및 정리"
          >
            <Wrench className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">단어 정리</span>
          </button>

          <button
            onClick={() => {
              setNewFolderCollectionId(
                selectedCollectionId !== 'all' ? selectedCollectionId : collections[0]?.id || ''
              );
              setShowCreateFolderModal(true);
            }}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 flex items-center gap-1 text-xs font-semibold cursor-pointer bg-white"
            title="새 폴더 생성"
          >
            <FolderPlus className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">새 폴더</span>
          </button>

          <button
            onClick={() => setShowCreateCollectionModal(true)}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 cursor-pointer bg-white"
            title="새 단어장 생성"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowAddWordModal(true)}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-medium text-xs flex items-center gap-1 hover:bg-indigo-700 active:scale-95 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>단어 추가</span>
          </button>
        </div>
      </div>

      {/* Repair Notice Alert */}
      {repairNotice && (
        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center gap-2 shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium leading-relaxed">{repairNotice}</span>
        </div>
      )}

      {/* Collection Scroll Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-2">
        <button
          onClick={() => {
            setSelectedCollectionId('all');
            setSelectedFolderId('all');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            selectedCollectionId === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          전체 카테고리 ({items.length})
        </button>

        {collections.map(col => {
          const count = items.filter(i => i.collectionId === col.id).length;
          const isSelected = selectedCollectionId === col.id;
          return (
            <button
              key={col.id}
              onClick={() => {
                setSelectedCollectionId(col.id);
                setSelectedFolderId('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isSelected ? '#ffffff' : col.color }}
              />
              <span>{col.name}</span>
              <span className="opacity-70 text-[10px]">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Folder Sub-tabs (Inside Category) */}
      <div className="bg-slate-100/90 rounded-2xl p-2.5 mb-3 border border-slate-200/70">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
            <Folder className="w-3.5 h-3.5 text-indigo-600" />
            <span>폴더 선택 (카테고리 내 폴더 분할)</span>
          </div>
          <button
            onClick={() => {
              setNewFolderCollectionId(
                selectedCollectionId !== 'all' ? selectedCollectionId : collections[0]?.id || ''
              );
              setShowCreateFolderModal(true);
            }}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>+ 새 폴더</span>
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            onClick={() => setSelectedFolderId('all')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedFolderId === 'all'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            📁 전체 단어 ({filteredItems.length})
          </button>

          {currentFolders.map(folder => {
            const count = items.filter(i => {
              if (selectedCollectionId !== 'all' && i.collectionId !== selectedCollectionId) return false;
              return i.folderId === folder.id;
            }).length;
            const isSelected = selectedFolderId === folder.id;

            return (
              <div
                key={folder.id}
                className={`flex items-center rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="px-2.5 py-1 flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: folder.color || '#4F46E5' }}
                  />
                  <span>{folder.name}</span>
                  <span className="text-[10px] opacity-70 font-normal">({count})</span>
                </button>

                {/* Delete folder button */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (confirm(`'${folder.name}' 폴더를 삭제하시겠습니까? (단어는 보존됩니다)`)) {
                      onDeleteFolder(folder.id);
                      if (selectedFolderId === folder.id) setSelectedFolderId('all');
                    }
                  }}
                  className="pr-2 pl-0.5 text-slate-300 hover:text-rose-500 cursor-pointer"
                  title="폴더 삭제"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="단어 또는 뜻 검색..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/90 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {/* Memory Status Filter Chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-none text-xs">
        {[
          { id: 'all', label: '모든 상태' },
          { id: 'new', label: '새 단어' },
          { id: 'learning', label: '학습 중' },
          { id: 'retaining', label: '기억 중' },
          { id: 'mastered', label: '장기 기억' },
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => setStatusFilter(filter.id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              statusFilter === filter.id
                ? 'bg-slate-200 text-slate-900 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Selection Mode Notice / Quick Tip */}
      {isSelectionMode && (
        <div className="mb-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center justify-between animate-in fade-in duration-150">
          <span className="font-semibold">
            단어를 탭하여 선택하고, 하단 바에서 일괄 삭제하거나 폴더로 이동하세요.
          </span>
          <button
            onClick={() => {
              setIsSelectionMode(false);
              setSelectedItemIds(new Set());
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold ml-2 underline shrink-0 cursor-pointer"
          >
            선택 종료
          </button>
        </div>
      )}

      {/* Vocabulary Items List */}
      <div className="space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200 p-6">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">해당하는 단어가 없습니다</p>
            <p className="text-xs text-slate-400 mt-1">단어를 새로 등록하거나 필터를 변경해보세요</p>
          </div>
        ) : (
          filteredItems.map(item => {
            const state = memoryStateMap.get(item.id);
            const status: MemoryStatus = state?.status || 'new';
            const recallPct = Math.round((state?.estimatedRecallProbability || 0.5) * 100);
            const itemFolder = folders.find(f => f.id === item.folderId);
            const isSelected = selectedItemIds.has(item.id);

            return (
              <div
                key={item.id}
                onTouchStart={e => handleItemTouchStart(item.id, e)}
                onTouchMove={e => handleItemTouchMove(item.id, e)}
                onTouchEnd={() => handleItemTouchEnd(item.id)}
                onMouseDown={() => handleItemMouseDown(item.id)}
                onMouseUp={() => handleItemMouseUp(item.id)}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSelectItem(item.id);
                  } else {
                    setInspectingItem(item);
                  }
                }}
                className={`bg-white hover:bg-slate-50/80 border rounded-2xl p-3.5 transition-all cursor-pointer shadow-sm active:scale-[0.99] flex items-center justify-between select-none ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500'
                    : 'border-slate-200/80'
                }`}
              >
                {/* Selection Checkbox */}
                {isSelectionMode && (
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      toggleSelectItem(item.id);
                    }}
                    className={`w-5 h-5 rounded-lg mr-3 shrink-0 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'border-2 border-slate-300 hover:border-indigo-400 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                )}

                <div className="flex-1 pr-3 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`font-bold text-slate-900 text-base break-keep ${
                        isRTL(item.sourceLanguage) ? 'font-hebrew text-xl font-medium tracking-wide' : ''
                      }`}
                      dir={isRTL(item.sourceLanguage) ? 'rtl' : 'ltr'}
                      lang={item.sourceLanguage}
                    >
                      {item.term}
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        speakEnglishWord(item.term, 0.95, item.sourceLanguage);
                      }}
                      className="text-slate-400 hover:text-indigo-600 p-0.5 rounded-full cursor-pointer shrink-0"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    {item.sourceLanguage && (
                      <span className="text-xs" title={getLanguageMeta(item.sourceLanguage).name}>
                        {getLanguageMeta(item.sourceLanguage).flag}
                      </span>
                    )}
                    {getStatusBadge(status)}
                    {itemFolder && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[10px] text-indigo-700 font-medium border border-indigo-100/80 shrink-0">
                        <Folder className="w-2.5 h-2.5 text-indigo-500" />
                        <span>{itemFolder.name}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed break-keep truncate">
                    {item.userMeaning}
                  </p>
                </div>

                {/* Ebbinghaus Curve & Retention Status Indicator */}
                <div className="text-right flex flex-col items-end shrink-0 pl-2">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold ${
                      recallPct < 65 ? 'text-rose-600' : recallPct < 80 ? 'text-amber-600' : 'text-indigo-600'
                    }`}>{recallPct}%</span>
                    <span className="text-[10px] text-slate-400">유지</span>
                  </div>
                  <div className="w-14 bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        recallPct < 65 ? 'bg-rose-500' : recallPct < 80 ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${recallPct}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-indigo-600/80 mt-1 font-medium hover:text-indigo-800">
                    망각곡선 보기 📈
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Selection Management Action Bar */}
      {isSelectionMode && (
        <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-3 shadow-2xl border border-slate-800 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSelectAll}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              {isAllSelected ? '선택 해제' : `전체 선택 (${filteredItems.length})`}
            </button>
            <span className="text-xs font-bold text-indigo-300">
              {selectedItemIds.size}개 선택됨
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setBatchTargetFolderId(selectedFolderId !== 'all' ? selectedFolderId : 'none');
                setShowBatchMoveModal(true);
              }}
              disabled={selectedItemIds.size === 0}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Folder className="w-3.5 h-3.5 text-indigo-400" />
              <span>폴더 이동</span>
            </button>

            <button
              onClick={handleBatchDelete}
              disabled={selectedItemIds.size === 0}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-30 transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>선택 삭제</span>
            </button>

            <button
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedItemIds(new Set());
              }}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 cursor-pointer"
              title="선택 모드 종료"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Batch Move Modal */}
      {showBatchMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <Folder className="w-5 h-5 text-indigo-600" />
              <span>선택한 {selectedItemIds.size}개 단어 폴더 이동</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              이동할 대상 폴더를 선택해주세요
            </p>

            <form onSubmit={handleBatchMoveConfirm} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  대상 폴더
                </label>
                <select
                  value={batchTargetFolderId}
                  onChange={e => setBatchTargetFolderId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  <option value="none">📁 기본 / 폴더 없음</option>
                  {currentFolders.map(f => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchMoveModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  이동하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Item Modal with Ebbinghaus Curve and Folder switch */}
      {inspectingItem && (
        <WordDetailModal
          item={inspectingItem}
          memoryState={memoryStateMap.get(inspectingItem.id)}
          folders={folders}
          onClose={() => setInspectingItem(null)}
          onUpdate={updated => {
            onUpdateItem(updated);
            setInspectingItem(updated);
          }}
          onDelete={id => {
            onDeleteItem(id);
            setInspectingItem(null);
          }}
        />
      )}

      {/* Add Single Word Modal */}
      {showAddWordModal && (
        <AddWordModal
          collections={collections}
          selectedCollectionId={selectedCollectionId !== 'all' ? selectedCollectionId : collections[0]?.id || ''}
          folders={folders}
          selectedFolderId={selectedFolderId !== 'all' ? selectedFolderId : ''}
          onClose={() => setShowAddWordModal(false)}
          onAdd={newItem => {
            onAddItem(newItem);
          }}
        />
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <FolderPlus className="w-5 h-5 text-indigo-600" />
              <span>새 폴더 만들기</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              카테고리 내에서 단어를 챕터/Day/주제별로 세분화하여 관리할 수 있습니다.
            </p>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  소속 단어장 (카테고리)
                </label>
                <select
                  value={newFolderCollectionId}
                  onChange={e => setNewFolderCollectionId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  {collections.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  폴더 이름
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="예: Day 1 기초, 비즈니스 미팅, 문법 필수"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-medium cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  폴더 생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Collection Modal */}
      {showCreateCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">새 단어장 생성</h3>
            <p className="text-xs text-slate-500 mb-4">
              예: 토플 어휘, 비즈니스 이메일, 수능 영어, 여행 영어 등
            </p>

            <form onSubmit={handleCreateCollection} className="space-y-4">
              <input
                type="text"
                autoFocus
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
                placeholder="단어장 이름 입력"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCollectionModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!newCollectionName.trim()}
                  className="px-4 py-2 text-xs bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                >
                  만들기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
