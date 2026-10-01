import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Download,
  Share2,
  PlusSquare,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Zap,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface MobileAppInstallModalProps {
  onClose: () => void;
}

export const MobileAppInstallModal: React.FC<MobileAppInstallModalProps> = ({ onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'pwa' | 'apk'>('pwa');

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-lg rounded-3xl shadow-2xl p-6 relative max-h-[92vh] flex flex-col overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-5 shrink-0">
          <img
            src="/pwa-192x192.png"
            alt="VocaCurve App Icon"
            className="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-xl shadow-blue-500/30 object-cover border border-blue-400/20"
          />
          <h2 className="text-2xl font-black tracking-tight text-white">
            스마트폰에서 VocaCurve 이용하기
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            APK 파일을 다운받거나, 1초 만에 폰 홈 화면에 정식 앱으로 설치할 수 있습니다.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-800 p-1 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('pwa')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'pwa'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>방법 1: 1초 홈 화면 앱 설치 (추천)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apk')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'apk'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>방법 2: .APK 파일 받기</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          {activeTab === 'pwa' ? (
            <div className="space-y-4">
              {/* Feature Highlights */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-400 mb-1">
                    <ShieldCheck className="w-4 h-4" />
                    <span>출처 불분명 경고 없음</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    보안 경고 없이 공식 표준(PWA)으로 폰 바탕화면에 즉시 설치됩니다.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400 mb-1">
                    <Zap className="w-4 h-4" />
                    <span>완전한 독립 앱 구동</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    주소창 없이 전체 화면으로 뜨며 오프라인에서도 단어장이 작동합니다.
                  </p>
                </div>
              </div>

              {/* Direct Install Button (If browser supports BeforeInstallPrompt) */}
              {isInstallable && !isInstalled && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-500/40 text-center">
                  <p className="text-xs text-indigo-200 mb-2 font-medium">
                    브라우저에서 즉시 설치 가능한 환경이 감지되었습니다!
                  </p>
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl font-extrabold text-sm shadow-lg shadow-indigo-600/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>지금 기기에 VocaCurve 앱 설치하기</span>
                  </button>
                </div>
              )}

              {/* Installed Notice */}
              {isInstalled && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-2.5 text-xs text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>이미 기기에 설치되어 독립 앱(Standalone) 모드로 실행 중입니다!</span>
                </div>
              )}

              {/* Step-by-Step Guide for Android & iOS */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3 text-xs">
                <span className="font-bold text-white block">📱 스마트폰에서 1초 만에 설치하는 방법</span>

                {/* Android Steps */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
                    <span>안드로이드 (삼성 인터넷 / 크롬)</span>
                  </span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    1. 폰 브라우저 우측 상단 <strong>메뉴(점 3개)</strong>를 터치합니다.<br />
                    2. <strong>[앱 설치]</strong> 또는 <strong>[홈 화면에 추가]</strong>를 누르면 1초 만에 폰 바탕화면에 VocaCurve 앱 아이콘이 생성됩니다.
                  </p>
                </div>

                {/* iPhone Steps */}
                <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                  <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
                    <span>아이폰 / 아이패드 (사파리)</span>
                  </span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    1. 하단 도구막대의 <strong>공유 버튼(네모+화살표)</strong>을 터치합니다.<br />
                    2. 아래로 스크롤하여 <strong>[홈 화면에 추가]</strong>를 누르면 정식 앱으로 추가됩니다.
                  </p>
                </div>
              </div>

              {/* Share/Copy URL box */}
              <div className="p-3.5 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-slate-400 block font-medium">스마트폰으로 보낼 주소</span>
                  <span className="text-xs text-indigo-300 font-mono truncate block">{currentUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '복사됨' : '주소 복사'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* APK Download Guide */
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/30 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <Download className="w-4 h-4 text-indigo-400" />
                  <span>PWABuilder로 순수 .APK 패키징하기</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  마이크로소프트의 공식 오픈소스 도구인 <strong>PWABuilder</strong>를 이용하면, 코딩이나 안드로이드 스튜디오 없이 웹 주소만으로 구글 플레이 등록용 및 직접 설치용 <strong>.APK / .AAB 파일</strong>을 1분 만에 무료로 생성할 수 있습니다.
                </p>
              </div>

              <div className="space-y-2.5">
                <span className="font-bold text-white block">🛠️ 1분 만에 APK 파일 추출하는 순서</span>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                  <span className="font-bold text-indigo-300">1단계: 앱 주소 복사하기</span>
                  <div className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded-lg mt-1 font-mono text-[11px] text-slate-300">
                    <span className="truncate">{currentUrl}</span>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold shrink-0 cursor-pointer"
                    >
                      {copied ? '복사됨' : '복사'}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                  <span className="font-bold text-indigo-300">2단계: PWABuilder 접속</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    <strong>pwabuilder.com</strong> 사이트에 접속하여 방금 복사한 VocaCurve 주소를 입력하고 [Start]를 누릅니다.
                  </p>
                  <a
                    href="https://www.pwabuilder.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs mt-1 transition-colors"
                  >
                    <span>PWABuilder 바로가기</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                  <span className="font-bold text-indigo-300">3단계: [Package for Android] 클릭</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    화면 상단의 [Package for Store] ➔ <strong>[Android]</strong>를 선택하면 서명된 설치용 <strong>.apk</strong> 및 구글 플레이용 번들이 즉시 다운로드됩니다!
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 text-[11px] leading-relaxed">
                💡 <strong>안내:</strong> 안드로이드 스마트폰에서는 굳이 번거롭게 APK 파일을 따로 내려받아 보안 설정을 풀지 않더라도, 브라우저의 <strong>[홈 화면에 추가 / 앱 설치]</strong> 버튼을 누르면 내부적으로 완벽한 독립 네이티브 앱 형태로 작동합니다.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 text-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
