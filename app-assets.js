"use strict";

/*
 * assetconfig.js의 경로를 실제 img 요소와 CSS 배경 변수에 적용합니다.
 * 설정과 화면 적용을 분리해 HTML·CSS에는 이미지 파일명이 직접 남지 않도록 합니다.
 */

/**
 * 설정값을 브라우저에서 사용할 경로 문자열로 정리합니다.
 * @param {unknown} value assetconfig.js에서 읽은 값
 * @returns {string} 공백을 제거하고 슬래시를 통일한 경로. 잘못된 값은 빈 문자열
 */
function normalizeVisualAssetPath(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\\/g, "/");
}

/**
 * img 요소에 경로를 적용하며, 빈 경로이면 깨진 이미지 아이콘 대신 요소를 숨깁니다.
 * @param {HTMLImageElement} image 경로를 받을 이미지 요소
 * @param {unknown} configuredPath assetconfig.js의 이미지 경로
 * @returns {boolean} 표시할 유효한 경로가 적용됐는지 여부
 */
function applyImageAsset(image, configuredPath) {
  const path = normalizeVisualAssetPath(configuredPath);
  image.hidden = !path;
  if (path) image.src = path;
  else image.removeAttribute("src");
  return Boolean(path);
}

/**
 * 상대 경로를 현재 문서 기준 절대 URL로 바꿔 CSS url() 값으로 안전하게 감쌉니다.
 * @param {unknown} configuredPath assetconfig.js의 배경 이미지 경로
 * @returns {string} CSS 사용자 정의 속성에 넣을 url("...") 또는 none
 */
function createCssAssetUrl(configuredPath) {
  const path = normalizeVisualAssetPath(configuredPath);
  if (!path) return "none";
  try {
    return `url("${new URL(path, document.baseURI).href}")`;
  } catch {
    return "none";
  }
}

/**
 * 최초 앱 초기화 때 로고·타이틀·방송·결과 화면의 이미지 경로를 한꺼번에 적용합니다.
 */
function applyVisualAssets() {
  entryLogo.classList.remove("is-asset-ready");
  if (applyImageAsset(entryLogo, ASSET_CONFIG.entry?.logo)) {
    // src 없이 파싱된 img에서 입장 애니메이션이 먼저 끝나지 않도록 경로 적용 뒤 시작 클래스를 붙입니다.
    void entryLogo.offsetWidth;
    entryLogo.classList.add("is-asset-ready");
  }
  applyImageAsset(streamCharacter, ASSET_CONFIG.stream?.character);
  const backgroundAssets = [
    ["--asset-title-background", ASSET_CONFIG.title?.background],
    ["--asset-stream-background", ASSET_CONFIG.stream?.background],
    ["--asset-stream-disconnected-background", ASSET_CONFIG.stream?.disconnectedBackground],
    ["--asset-stage-result-waiting", ASSET_CONFIG.results?.stage?.waitingBackground],
    ["--asset-stage-result-revealed", ASSET_CONFIG.results?.stage?.revealedBackground],
    ["--asset-story-result-waiting", ASSET_CONFIG.results?.storyDay?.waitingBackground],
    ["--asset-story-result-revealed", ASSET_CONFIG.results?.storyDay?.revealedBackground],
    ["--asset-final-result-waiting", ASSET_CONFIG.results?.final?.waitingBackground],
    ["--asset-final-result-revealed", ASSET_CONFIG.results?.final?.revealedBackground]
  ];
  backgroundAssets.forEach(([property, path]) => {
    document.documentElement.style.setProperty(property, createCssAssetUrl(path));
  });
}
